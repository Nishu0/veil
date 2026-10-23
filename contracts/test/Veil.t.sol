// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Groth16Verifier} from "../src/zk/Groth16Verifier.sol";
import {ZkComplianceRegistry, IGroth16Verifier} from "../src/ZkComplianceRegistry.sol";
import {VeilPermissionsHook} from "../src/VeilPermissionsHook.sol";
import {VRWA} from "../src/VRWA.sol";
import {VeilVault, ITBill, IPriceOracle} from "../src/VeilVault.sol";
import {AgentLog} from "../src/AgentLog.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {MockTBill} from "../src/mocks/MockTBill.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {MockExchange} from "../src/mocks/MockExchange.sol";
import {IExchangeModule} from "../src/injective/Exchange.sol";
import {ExchangeTypes} from "../src/injective/ExchangeTypes.sol";

contract VeilTest is Test {
    string constant MARKET = "0xTSLA-USDT-IASSET-PERP";
    uint256 constant USDT = 1e6;

    MockUSDT usdt;
    MockTBill tbill;
    MockOracle oracle;
    MockExchange exchange;
    ZkComplianceRegistry registry;
    VeilPermissionsHook hook;
    VRWA vrwa;
    VeilVault vault;

    address alice; // verified with a real Groth16 proof
    address carol; // second verified holder
    address bob = makeAddr("bob"); // never verified
    address agent = makeAddr("agent");
    string json;

    function setUp() public {
        vm.warp(1_800_000_000);
        json = vm.readFile("test/fixtures/proof.json");
        alice = vm.parseJsonAddress(json, ".wallet");
        carol = vm.parseJsonAddress(json, ".wallet2");

        usdt = new MockUSDT();
        tbill = new MockTBill(usdt);
        usdt.setMinter(address(tbill), true);
        oracle = new MockOracle();
        exchange = new MockExchange(usdt, oracle, "usdt");
        exchange.addMarket(MARKET);
        oracle.setPrice(MARKET, 300e18);

        registry = new ZkComplianceRegistry(
            IGroth16Verifier(address(new Groth16Verifier())),
            vm.parseJsonUint(json, ".issuerAx"),
            vm.parseJsonUint(json, ".issuerAy"),
            [uint256(408), 364, 760]
        );
        hook = new VeilPermissionsHook(registry);
        vault = new VeilVault(
            usdt, ITBill(address(tbill)), IExchangeModule(address(exchange)), IPriceOracle(address(oracle)), registry, MARKET, "usdt"
        );
        vrwa = new VRWA(address(vault), hook);
        vault.setShareToken(vrwa);
        hook.setExempt(address(vault), true);

        for (uint256 i = 0; i < 3; i++) {
            address u = [alice, bob, carol][i];
            usdt.mint(u, 100_000 * USDT);
            vm.prank(u);
            usdt.approve(address(vault), type(uint256).max);
        }
    }

    // ------------------------------------------------------------ helpers

    function _register(address who, string memory sfx) internal {
        uint256[] memory a = vm.parseJsonUintArray(json, string.concat(".a", sfx));
        uint256[] memory b0 = vm.parseJsonUintArray(json, string.concat(".b", sfx, "[0]"));
        uint256[] memory b1 = vm.parseJsonUintArray(json, string.concat(".b", sfx, "[1]"));
        uint256[] memory c = vm.parseJsonUintArray(json, string.concat(".c", sfx));
        vm.prank(who);
        registry.register(
            [a[0], a[1]], [[b0[0], b0[1]], [b1[0], b1[1]]], [c[0], c[1]],
            vm.parseJsonUint(json, string.concat(".nullifier", sfx)),
            uint64(vm.parseJsonUint(json, ".expiry"))
        );
    }

    function _order(bool isBuy, uint256 qty, uint256 margin) internal view returns (IExchangeModule.DerivativeOrder memory) {
        return IExchangeModule.DerivativeOrder({
            marketID: MARKET,
            subaccountID: vault.subaccountID(),
            feeRecipient: "",
            price: ExchangeTypes.UFixed256x18.wrap(oracle.price(MARKET)),
            quantity: ExchangeTypes.UFixed256x18.wrap(qty),
            cid: "",
            orderType: isBuy ? "buy" : "sell",
            margin: ExchangeTypes.UFixed256x18.wrap(margin),
            triggerPrice: ExchangeTypes.UFixed256x18.wrap(0)
        });
    }

    function _fundedVaultWithMandate() internal {
        _register(alice, "");
        vm.prank(alice);
        vault.deposit(10_000 * USDT); // 3,000 USDT lands in the subaccount
        vault.grantMandate(agent, 1_500 * USDT, 7 days);
    }

    // ------------------------------------------------------- ZK compliance

    function test_RegisterWithRealProof_StoresNoIdentity() public {
        assertFalse(registry.isVerified(alice));
        _register(alice, "");
        assertTrue(registry.isVerified(alice));
        assertTrue(registry.nullifierUsed(vm.parseJsonUint(json, ".nullifier")));
    }

    function test_ProofIsBoundToWallet() public {
        uint256[] memory a = vm.parseJsonUintArray(json, ".a");
        uint256[] memory b0 = vm.parseJsonUintArray(json, ".b[0]");
        uint256[] memory b1 = vm.parseJsonUintArray(json, ".b[1]");
        uint256[] memory c = vm.parseJsonUintArray(json, ".c");
        uint256 nullifier = vm.parseJsonUint(json, ".nullifier");
        uint64 expiry = uint64(vm.parseJsonUint(json, ".expiry"));
        vm.prank(bob); // front-runner replays alice's proof
        vm.expectRevert(ZkComplianceRegistry.InvalidProof.selector);
        registry.register([a[0], a[1]], [[b0[0], b0[1]], [b1[0], b1[1]]], [c[0], c[1]], nullifier, expiry);
    }

    function test_NullifierCannotBeReused() public {
        _register(alice, "");
        vm.expectRevert(ZkComplianceRegistry.NullifierAlreadyUsed.selector);
        this.externalRegister(alice, "");
    }

    function externalRegister(address who, string memory sfx) external {
        _register(who, sfx);
    }

    // --------------------------------------------------- permissioned token

    function test_UnverifiedWalletCannotDeposit() public {
        vm.prank(bob);
        vm.expectRevert(VeilVault.NotVerified.selector);
        vault.deposit(1_000 * USDT);
    }

    function test_TransferToUnverifiedWalletReverts() public {
        _register(alice, "");
        vm.startPrank(alice);
        vault.deposit(1_000 * USDT);
        vm.expectRevert(abi.encodeWithSelector(VRWA.TransferRestricted.selector, alice, bob));
        vrwa.transfer(bob, 100 * USDT);
        vm.stopPrank();
    }

    function test_TransferBetweenVerifiedWalletsPasses() public {
        _register(alice, "");
        _register(carol, "2");
        vm.startPrank(alice);
        vault.deposit(1_000 * USDT);
        vrwa.transfer(carol, 100 * USDT);
        vm.stopPrank();
        assertEq(vrwa.balanceOf(carol), 100 * USDT);
    }

    function test_RevokedWalletCannotReceive() public {
        _register(alice, "");
        _register(carol, "2");
        vm.prank(alice);
        vault.deposit(1_000 * USDT);
        registry.revoke(carol);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VRWA.TransferRestricted.selector, alice, carol));
        vrwa.transfer(carol, 1);
    }

    // ---------------------------------------------------------------- vault

    function test_DepositAllocatesAndWithdrawReturnsFunds() public {
        _register(alice, "");
        vm.startPrank(alice);
        uint256 shares = vault.deposit(10_000 * USDT);
        assertEq(shares, 10_000 * USDT);
        assertApproxEqAbs(vault.nav(), 10_000 * USDT, 2);
        assertApproxEqAbs(vault.tbillValue(), 6_000 * USDT, 2);
        assertEq(vault.subaccountEquity(), 3_000 * USDT);

        uint256 before = usdt.balanceOf(alice);
        vault.withdraw(shares); // pulls idle, then T-bills, then free margin
        assertApproxEqAbs(usdt.balanceOf(alice) - before, 10_000 * USDT, 2);
        assertEq(vrwa.totalSupply(), 0);
        vm.stopPrank();
    }

    function test_TBillYieldRaisesSharePrice() public {
        _register(alice, "");
        vm.prank(alice);
        vault.deposit(10_000 * USDT);
        tbill.simulateYield(365);
        assertApproxEqRel(vault.nav(), 10_300 * USDT, 0.001e18); // 5% on the 60% T-bill sleeve
        assertGt(vault.sharePrice(), 1.029e18);
    }

    // -------------------------------------------------------- agent mandate

    function test_AgentTradesVaultSubaccountUnderMandate() public {
        _fundedVaultWithMandate();
        IExchangeModule.DerivativeOrder memory o = _order(false, 10e18, 500e18);
        vm.prank(agent);
        exchange.createDerivativeLimitOrder(address(vault), o); // short 10 TSLA, 6x
        VeilVault.PositionView memory p = vault.position();
        assertTrue(p.open);
        assertFalse(p.isLong);
        assertEq(p.leverageBps, 60_000);
        (, uint256 remaining) = exchange.grantInfo(address(vault), agent, 8);
        assertEq(remaining, 1_000 * USDT);
    }

    function test_AgentOverSpendLimitReverts() public {
        _fundedVaultWithMandate();
        IExchangeModule.DerivativeOrder memory o = _order(false, 10e18, 1_501e18);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(MockExchange.SpendLimitExceeded.selector, 1_501 * USDT, 1_500 * USDT));
        exchange.createDerivativeLimitOrder(address(vault), o);
    }

    function test_ExpiredMandateReverts() public {
        _fundedVaultWithMandate();
        vm.warp(block.timestamp + 7 days + 1);
        IExchangeModule.DerivativeOrder memory o = _order(false, 10e18, 500e18);
        vm.prank(agent);
        vm.expectPartialRevert(MockExchange.AuthorizationExpired.selector);
        exchange.createDerivativeLimitOrder(address(vault), o);
    }

    function test_AgentCannotWithdrawVaultFunds() public {
        _fundedVaultWithMandate();
        string memory sub = vault.subaccountID();
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(MockExchange.NotAuthorized.selector, agent, 2));
        exchange.withdraw(address(vault), sub, "usdt", 1_000 * USDT);
    }

    function test_StrangerCannotTradeVaultSubaccount() public {
        _fundedVaultWithMandate();
        IExchangeModule.DerivativeOrder memory o = _order(false, 10e18, 500e18);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(MockExchange.NotAuthorized.selector, bob, 8));
        exchange.createDerivativeLimitOrder(address(vault), o);
    }

    function test_RevokedMandateReverts() public {
        _fundedVaultWithMandate();
        vault.revokeMandate();
        IExchangeModule.DerivativeOrder memory o = _order(false, 10e18, 500e18);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(MockExchange.NotAuthorized.selector, agent, 8));
        exchange.createDerivativeLimitOrder(address(vault), o);
    }

    // ---------------------------------------------------------- weekend gap

    function test_WeekendGap_LeveredBookIsLiquidated_DeLeveredBookSurvives() public {
        _fundedVaultWithMandate();
        string memory sub = vault.subaccountID();
        vm.startPrank(agent);
        exchange.createDerivativeLimitOrder(address(vault), _order(false, 10e18, 500e18)); // 6x short
        uint256 snap = vm.snapshotState();

        // (a) no guard: frozen mark over the weekend, +18% Monday gap
        vm.stopPrank();
        oracle.setSession(MockOracle.Session.Weekend);
        vm.expectRevert(MockOracle.OracleFrozen.selector);
        oracle.setPrice(MARKET, 354e18);
        oracle.setSession(MockOracle.Session.Open);
        oracle.setPrice(MARKET, 354e18);
        exchange.liquidate(sub, MARKET);
        assertFalse(vault.position().open);

        // (b) guard: before the close the agent halves size and re-posts the margin
        vm.revertToState(snap);
        vm.startPrank(agent);
        exchange.createDerivativeLimitOrder(address(vault), _order(true, 5e18, 0)); // reduce
        exchange.increasePositionMargin(address(vault), sub, sub, MARKET, ExchangeTypes.UFixed256x18.wrap(250e18));
        vm.stopPrank();
        assertEq(vault.position().leverageBps, 30_000);
        oracle.setSession(MockOracle.Session.Weekend);
        oracle.setSession(MockOracle.Session.Open);
        oracle.setPrice(MARKET, 354e18);
        vm.expectRevert(MockExchange.NotLiquidatable.selector);
        exchange.liquidate(sub, MARKET);
        assertTrue(vault.position().open);
    }
}
