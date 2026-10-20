// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ZkComplianceRegistry} from "./ZkComplianceRegistry.sol";

interface IPermissionsHook {
    function isTransferRestricted(address from, address to, uint256 amount) external view returns (bool);
}

/// @title VeilPermissionsHook
/// @notice Transfer policy for vRWA. On Injective this contract is registered
/// as the EVM hook of the token's permissions namespace, so the chain itself
/// calls it on every bank transfer (EVM or native). In this testnet build the
/// vRWA token calls it from its own transfer path.
contract VeilPermissionsHook is IPermissionsHook, Ownable {
    ZkComplianceRegistry public immutable registry;
    mapping(address => bool) public exempt; // protocol contracts (the vault)

    constructor(ZkComplianceRegistry registry_) Ownable(msg.sender) {
        registry = registry_;
    }

    function setExempt(address who, bool ok) external onlyOwner {
        exempt[who] = ok;
    }

    function isTransferRestricted(address from, address to, uint256) external view returns (bool) {
        if (to == address(0)) return false; // redemptions always allowed
        bool toOk = exempt[to] || registry.isVerified(to);
        bool fromOk = from == address(0) || exempt[from] || registry.isVerified(from) || exempt[to];
        return !(toOk && fromOk);
    }
}
