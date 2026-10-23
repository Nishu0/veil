pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/comparators.circom";

// VEIL compliance credential.
//
// Proves, without revealing who you are:
//   - an approved issuer signed a credential over your attributes
//   - KYC passed, investor is accredited
//   - your jurisdiction is not on the public blocklist
// and binds the proof to one wallet and one nullifier.
//
// The issuer signs Poseidon(secretCommit, nameHash, kyc, jurisdiction, accredited, expiry).
// It only ever sees secretCommit = Poseidon(secret), so it cannot compute the
// nullifier = Poseidon(secret, 1) and cannot link a wallet back to an identity.
template Credential(nBlocked) {
    // ---- public ----
    signal input issuerAx;
    signal input issuerAy;
    signal input wallet;      // msg.sender, stops a front-runner replaying the proof
    signal input nullifier;   // one registration per credential
    signal input expiry;      // unix seconds, checked against block.timestamp on-chain
    signal input blocked[nBlocked];

    // ---- private ----
    signal input secret;
    signal input nameHash;
    signal input kyc;
    signal input jurisdiction;
    signal input accredited;
    signal input sigR8x;
    signal input sigR8y;
    signal input sigS;

    component commit = Poseidon(1);
    commit.inputs[0] <== secret;

    component cred = Poseidon(6);
    cred.inputs[0] <== commit.out;
    cred.inputs[1] <== nameHash;
    cred.inputs[2] <== kyc;
    cred.inputs[3] <== jurisdiction;
    cred.inputs[4] <== accredited;
    cred.inputs[5] <== expiry;

    component sig = EdDSAPoseidonVerifier();
    sig.enabled <== 1;
    sig.Ax <== issuerAx;
    sig.Ay <== issuerAy;
    sig.S <== sigS;
    sig.R8x <== sigR8x;
    sig.R8y <== sigR8y;
    sig.M <== cred.out;

    kyc === 1;
    accredited === 1;

    component eq[nBlocked];
    for (var i = 0; i < nBlocked; i++) {
        eq[i] = IsEqual();
        eq[i].in[0] <== jurisdiction;
        eq[i].in[1] <== blocked[i];
        eq[i].out === 0;
    }

    component nul = Poseidon(2);
    nul.inputs[0] <== secret;
    nul.inputs[1] <== 1;
    nullifier === nul.out;

    // constrain wallet so it is part of the statement
    signal walletSq;
    walletSq <== wallet * wallet;
}

component main {public [issuerAx, issuerAy, wallet, nullifier, expiry, blocked]} = Credential(3);
