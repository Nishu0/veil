// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[8] calldata pubSignals
    ) external view returns (bool);
}

/// @title ZkComplianceRegistry
/// @notice Replaces a public KYC allowlist. A wallet submits a Groth16 proof
/// that it holds an issuer-signed credential (KYC passed, accredited,
/// jurisdiction not blocked). The registry stores only a nullifier and an
/// expiry: no name, no document hash, nothing that links the wallet to a person.
contract ZkComplianceRegistry is Ownable {
    IGroth16Verifier public immutable verifier;
    uint256 public immutable issuerAx; // issuer's BabyJubJub public key
    uint256 public immutable issuerAy;
    uint256[3] public blockedJurisdictions; // ISO 3166-1 numeric codes

    mapping(uint256 => bool) public nullifierUsed;
    mapping(address => uint64) public verifiedUntil;

    event Registered(address indexed wallet, uint256 nullifier, uint64 expiry);
    event Revoked(address indexed wallet);

    error InvalidProof();
    error NullifierAlreadyUsed();
    error CredentialExpired();

    constructor(IGroth16Verifier verifier_, uint256 issuerAx_, uint256 issuerAy_, uint256[3] memory blocked_)
        Ownable(msg.sender)
    {
        verifier = verifier_;
        issuerAx = issuerAx_;
        issuerAy = issuerAy_;
        blockedJurisdictions = blocked_;
    }

    function register(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256 nullifier,
        uint64 expiry
    ) external {
        if (expiry <= block.timestamp) revert CredentialExpired();
        if (nullifierUsed[nullifier]) revert NullifierAlreadyUsed();
        uint256[8] memory pub = [
            issuerAx,
            issuerAy,
            uint256(uint160(msg.sender)),
            nullifier,
            uint256(expiry),
            blockedJurisdictions[0],
            blockedJurisdictions[1],
            blockedJurisdictions[2]
        ];
        if (!verifier.verifyProof(a, b, c, pub)) revert InvalidProof();
        nullifierUsed[nullifier] = true;
        verifiedUntil[msg.sender] = expiry;
        emit Registered(msg.sender, nullifier, expiry);
    }

    function isVerified(address wallet) public view returns (bool) {
        return verifiedUntil[wallet] > block.timestamp;
    }

    /// @notice Compliance off-switch (e.g. sanctions hit). Reveals nothing new.
    function revoke(address wallet) external onlyOwner {
        delete verifiedUntil[wallet];
        emit Revoked(wallet);
    }
}
