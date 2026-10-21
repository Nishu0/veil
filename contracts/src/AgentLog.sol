// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentLog
/// @notice Append-only audit trail. The agent commits keccak256 of the full
/// decision record (inputs, action, rationale) so anyone holding the record
/// can check it was not edited after the fact.
contract AgentLog is Ownable {
    enum Action {
        Hold,
        OpenHedge,
        DeLever,
        ReLever,
        Rejected // the chain refused something the agent tried
    }

    struct Decision {
        address agent;
        bytes32 recordHash;
        Action action;
        uint32 leverageBeforeBps; // 10_000 = 1x
        uint32 leverageAfterBps;
        uint64 timestamp;
    }

    Decision[] public decisions;
    mapping(address => bool) public isAgent;

    event DecisionLogged(
        uint256 indexed id, address indexed agent, bytes32 recordHash, Action action,
        uint32 leverageBeforeBps, uint32 leverageAfterBps
    );

    constructor() Ownable(msg.sender) {}

    function setAgent(address agent, bool ok) external onlyOwner {
        isAgent[agent] = ok;
    }

    function log(bytes32 recordHash, Action action, uint32 leverageBeforeBps, uint32 leverageAfterBps)
        external
        returns (uint256 id)
    {
        require(isAgent[msg.sender], "not agent");
        id = decisions.length;
        decisions.push(Decision(msg.sender, recordHash, action, leverageBeforeBps, leverageAfterBps, uint64(block.timestamp)));
        emit DecisionLogged(id, msg.sender, recordHash, action, leverageBeforeBps, leverageAfterBps);
    }

    function count() external view returns (uint256) {
        return decisions.length;
    }
}
