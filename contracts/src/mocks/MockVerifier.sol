// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only verifier that accepts everything. Never deployed by the scripts.
contract MockVerifier {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[8] calldata)
        external
        pure
        returns (bool)
    {
        return true;
    }
}
