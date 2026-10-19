// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Testnet stand-in for USDT (6 decimals). On Injective mainnet this is
/// the native bank denom exposed through the MultiVM Token Standard.
contract MockUSDT is ERC20, Ownable {
    mapping(address => bool) public minters;

    constructor() ERC20("Mock USDT", "USDT") Ownable(msg.sender) {
        minters[msg.sender] = true;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function setMinter(address who, bool ok) external onlyOwner {
        minters[who] = ok;
    }

    function mint(address to, uint256 amount) external {
        require(minters[msg.sender], "not minter");
        _mint(to, amount);
    }
}
