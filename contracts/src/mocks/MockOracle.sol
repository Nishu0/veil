// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Stand-in for the Pyth/SEDA 24/5 equity feed that prices iAssets.
/// Models the one behaviour VEIL cares about: the mark freezes over the
/// weekend while trading stays open, then gaps on Monday.
contract MockOracle is Ownable {
    enum Session {
        Open, // regular + extended hours, feed updating
        PreClose, // last hour before the Friday close
        Weekend // feed paused, mark frozen
    }

    Session public session;
    mapping(bytes32 => uint256) private _price; // 18-decimal human price
    uint64 public lastUpdate;

    event PriceUpdated(string marketID, uint256 price);
    event SessionChanged(Session session);

    error OracleFrozen();

    constructor() Ownable(msg.sender) {}

    function setPrice(string calldata marketID, uint256 price_) external onlyOwner {
        if (session == Session.Weekend) revert OracleFrozen();
        _price[keccak256(bytes(marketID))] = price_;
        lastUpdate = uint64(block.timestamp);
        emit PriceUpdated(marketID, price_);
    }

    function setSession(Session s) external onlyOwner {
        session = s;
        emit SessionChanged(s);
    }

    function price(string memory marketID) external view returns (uint256) {
        return _price[keccak256(bytes(marketID))];
    }
}
