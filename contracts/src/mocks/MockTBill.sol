// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// @notice Mock tokenized treasury bill. Price accrues at a fixed APY; the
/// yield is paid by minting MockUSDT on redemption. Replace with a real
/// permissioned MTS treasury token (e.g. issued through Injective Mint).
contract MockTBill is ERC20, Ownable {
    IERC20 public immutable usdt;
    uint256 public constant APY_BPS = 500; // 5%
    uint256 private _index = 1e18;
    uint64 private _indexTime;

    constructor(IERC20 usdt_) ERC20("Mock Tokenized T-Bill", "tBILL") Ownable(msg.sender) {
        usdt = usdt_;
        _indexTime = uint64(block.timestamp);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice USDT per tBILL, 18 decimals.
    function price() public view returns (uint256) {
        uint256 dt = block.timestamp - _indexTime;
        return _index + (_index * APY_BPS * dt) / (10_000 * 365 days);
    }

    /// @notice Demo helper: pretend `days_` days of yield have accrued.
    function simulateYield(uint256 days_) external onlyOwner {
        _index = price() + (price() * APY_BPS * days_ * 1 days) / (10_000 * 365 days);
        _indexTime = uint64(block.timestamp);
    }

    function subscribe(uint256 usdtIn) external returns (uint256 out) {
        usdt.transferFrom(msg.sender, address(this), usdtIn);
        out = (usdtIn * 1e18) / price();
        _mint(msg.sender, out);
    }

    function redeem(uint256 tbillIn) external returns (uint256 out) {
        out = (tbillIn * price()) / 1e18;
        _burn(msg.sender, tbillIn);
        uint256 bal = usdt.balanceOf(address(this));
        if (bal < out) IMintable(address(usdt)).mint(address(this), out - bal);
        usdt.transfer(msg.sender, out);
    }
}
