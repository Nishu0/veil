// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IPermissionsHook} from "./VeilPermissionsHook.sol";

/// @title vRWA - permissioned VEIL vault share
/// @notice Every mint and transfer is checked against the permissions hook.
/// Mainnet target is a MintBurnBankERC20 (MultiVM Token Standard) with the hook
/// registered on the denom's namespace; this ERC20 mirrors that behaviour.
contract VRWA is ERC20 {
    address public immutable vault;
    IPermissionsHook public immutable hook;

    error TransferRestricted(address from, address to);
    error OnlyVault();

    constructor(address vault_, IPermissionsHook hook_) ERC20("VEIL RWA Vault Share", "vRWA") {
        vault = vault_;
        hook = hook_;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != vault) revert OnlyVault();
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        if (msg.sender != vault) revert OnlyVault();
        _burn(from, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (hook.isTransferRestricted(from, to, value)) revert TransferRestricted(from, to);
        super._update(from, to, value);
    }
}
