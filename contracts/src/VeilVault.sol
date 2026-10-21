// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Cosmos} from "./injective/CosmosTypes.sol";
import {ExchangeTypes} from "./injective/ExchangeTypes.sol";
import {IExchangeModule} from "./injective/Exchange.sol";
import {ZkComplianceRegistry} from "./ZkComplianceRegistry.sol";
import {VRWA} from "./VRWA.sol";

interface ITBill is IERC20 {
    function price() external view returns (uint256);
    function subscribe(uint256 usdtIn) external returns (uint256);
    function redeem(uint256 tbillIn) external returns (uint256);
}

interface IPriceOracle {
    function price(string memory marketID) external view returns (uint256);
}

/// @title VeilVault
/// @notice Takes USDT from ZK-verified wallets and mints the permissioned vRWA
/// share. Capital is split between tokenized T-bills (base yield) and a margin
/// subaccount on Injective's exchange module, where an iAsset perp position is
/// run. Day-to-day risk is delegated to an agent through a scoped, expiring,
/// spend-capped authz grant: the agent can trade this subaccount but can never
/// withdraw from it.
contract VeilVault is Ownable {
    using Strings for uint256;

    IERC20 public immutable usdt;
    ITBill public immutable tbill;
    IExchangeModule public immutable exchange; // 0x…65 on Injective
    IPriceOracle public immutable oracle; // Pyth pull feed on Injective
    ZkComplianceRegistry public immutable registry;
    VRWA public vrwa;

    string public marketID; // iAsset perp market
    string public denom;
    string public subaccountID;

    uint256 public constant TBILL_BPS = 6000;
    uint256 public constant MARGIN_BPS = 3000; // remainder stays idle for redemptions

    address public agent;
    uint64 public mandateExpiry;
    uint256 public mandateSpendLimit;

    event Deposited(address indexed user, uint256 usdtIn, uint256 shares);
    event Withdrawn(address indexed user, uint256 shares, uint256 usdtOut);
    event MandateGranted(address indexed agent, uint256 spendLimit, uint64 expiry);
    event MandateRevoked(address indexed agent);

    error NotVerified();
    error InsufficientLiquidity(uint256 needed, uint256 liquid);
    error ShareTokenAlreadySet();

    constructor(
        IERC20 usdt_,
        ITBill tbill_,
        IExchangeModule exchange_,
        IPriceOracle oracle_,
        ZkComplianceRegistry registry_,
        string memory marketID_,
        string memory denom_
    ) Ownable(msg.sender) {
        usdt = usdt_;
        tbill = tbill_;
        exchange = exchange_;
        oracle = oracle_;
        registry = registry_;
        marketID = marketID_;
        denom = denom_;
        subaccountID = (uint256(uint160(address(this))) << 96).toHexString(32);
        // Only needed for the mock exchange / mock T-bill. With MTS tokens the
        // precompile debits the bank balance and no allowance exists.
        usdt_.approve(address(exchange_), type(uint256).max);
        usdt_.approve(address(tbill_), type(uint256).max);
    }

    function setShareToken(VRWA vrwa_) external onlyOwner {
        if (address(vrwa) != address(0)) revert ShareTokenAlreadySet();
        vrwa = vrwa_;
    }

    // ------------------------------------------------------------------ users

    function deposit(uint256 amount) external returns (uint256 shares) {
        if (!registry.isVerified(msg.sender)) revert NotVerified();
        uint256 supply = vrwa.totalSupply();
        uint256 navBefore = nav();
        usdt.transferFrom(msg.sender, address(this), amount);
        shares = supply == 0 || navBefore == 0 ? amount : (amount * supply) / navBefore;

        tbill.subscribe((amount * TBILL_BPS) / 10_000);
        exchange.deposit(address(this), subaccountID, denom, (amount * MARGIN_BPS) / 10_000);

        vrwa.mint(msg.sender, shares);
        emit Deposited(msg.sender, amount, shares);
    }

    function withdraw(uint256 shares) external returns (uint256 amount) {
        amount = (shares * nav()) / vrwa.totalSupply();
        vrwa.burn(msg.sender, shares);

        uint256 idle = usdt.balanceOf(address(this));
        if (idle < amount) {
            uint256 need = amount - idle;
            uint256 tb = tbill.balanceOf(address(this));
            uint256 tbNeeded = (need * 1e18) / tbill.price() + 1;
            tbill.redeem(tbNeeded > tb ? tb : tbNeeded);
            idle = usdt.balanceOf(address(this));
        }
        if (idle < amount) {
            (uint256 free,) = exchange.subaccountDeposit(subaccountID, denom);
            uint256 need = amount - idle;
            if (free < need) revert InsufficientLiquidity(amount, idle + free);
            exchange.withdraw(address(this), subaccountID, denom, need);
        }
        usdt.transfer(msg.sender, amount);
        emit Withdrawn(msg.sender, shares, amount);
    }

    // -------------------------------------------------------------------- NAV

    struct PositionView {
        bool open;
        bool isLong;
        uint256 quantity; // 1e18
        uint256 entryPrice; // 1e18
        uint256 margin; // 1e18
        uint256 markPrice; // 1e18
        uint256 notional; // 1e18
        int256 unrealizedPnl; // 1e18
        uint256 leverageBps; // notional / (margin + pnl), 10_000 = 1x
    }

    function position() public view returns (PositionView memory v) {
        v.markPrice = oracle.price(marketID);
        IExchangeModule.DerivativePosition[] memory ps = exchange.subaccountPositions(subaccountID);
        bytes32 m = keccak256(bytes(marketID));
        for (uint256 i = 0; i < ps.length; i++) {
            if (keccak256(bytes(ps[i].marketID)) != m) continue;
            v.open = true;
            v.isLong = ps[i].isLong;
            v.quantity = ExchangeTypes.UFixed256x18.unwrap(ps[i].quantity);
            v.entryPrice = ExchangeTypes.UFixed256x18.unwrap(ps[i].entryPrice);
            v.margin = ExchangeTypes.UFixed256x18.unwrap(ps[i].margin);
            v.notional = (v.quantity * v.markPrice) / 1e18;
            v.unrealizedPnl = (int256(v.quantity) * (int256(v.markPrice) - int256(v.entryPrice))) / 1e18;
            if (!v.isLong) v.unrealizedPnl = -v.unrealizedPnl;
            int256 equity = int256(v.margin) + v.unrealizedPnl;
            v.leverageBps = equity > 0 ? (v.notional * 10_000) / uint256(equity) : type(uint256).max;
        }
    }

    /// @notice Free collateral plus position equity, in USDT (6 decimals).
    function subaccountEquity() public view returns (uint256) {
        (uint256 free,) = exchange.subaccountDeposit(subaccountID, denom);
        PositionView memory v = position();
        int256 eq = int256(v.margin) + v.unrealizedPnl;
        return free + (eq > 0 ? uint256(eq) / 1e12 : 0);
    }

    function tbillValue() public view returns (uint256) {
        return (tbill.balanceOf(address(this)) * tbill.price()) / 1e18;
    }

    function nav() public view returns (uint256) {
        return usdt.balanceOf(address(this)) + tbillValue() + subaccountEquity();
    }

    /// @notice USDT per vRWA, 18 decimals.
    function sharePrice() external view returns (uint256) {
        uint256 supply = vrwa.totalSupply();
        return supply == 0 ? 1e18 : (nav() * 1e18) / supply;
    }

    // ---------------------------------------------------------------- mandate

    /// @notice Give `agent_` bounded trading authority over the vault subaccount.
    /// It may place derivative orders and add position margin, up to
    /// `spendLimit` USDT of committed margin, for `duration` seconds. It gets no
    /// withdraw, transfer or deposit rights.
    function grantMandate(address agent_, uint256 spendLimit, uint256 duration) external onlyOwner {
        Cosmos.Coin[] memory limit = new Cosmos.Coin[](1);
        limit[0] = Cosmos.Coin(spendLimit, denom);
        IExchangeModule.Authorization[] memory auths = new IExchangeModule.Authorization[](2);
        auths[0] = IExchangeModule.Authorization(ExchangeTypes.MsgType_CreateDerivativeLimitOrder, limit, duration);
        auths[1] = IExchangeModule.Authorization(ExchangeTypes.MsgType_IncreasePositionMargin, limit, duration);
        exchange.approve(agent_, auths);
        agent = agent_;
        mandateSpendLimit = spendLimit;
        mandateExpiry = uint64(block.timestamp + duration);
        emit MandateGranted(agent_, spendLimit, mandateExpiry);
    }

    function revokeMandate() external onlyOwner {
        ExchangeTypes.MsgType[] memory methods = new ExchangeTypes.MsgType[](2);
        methods[0] = ExchangeTypes.MsgType_CreateDerivativeLimitOrder;
        methods[1] = ExchangeTypes.MsgType_IncreasePositionMargin;
        exchange.revoke(agent, methods);
        emit MandateRevoked(agent);
        agent = address(0);
        mandateExpiry = 0;
    }

    /// @notice Owner escape hatch: trade the subaccount directly through the precompile.
    function placeOrder(bool isBuy, uint256 quantity, uint256 price, uint256 margin) external onlyOwner {
        exchange.createDerivativeLimitOrder(
            address(this),
            IExchangeModule.DerivativeOrder({
                marketID: marketID,
                subaccountID: subaccountID,
                feeRecipient: "",
                price: ExchangeTypes.UFixed256x18.wrap(price),
                quantity: ExchangeTypes.UFixed256x18.wrap(quantity),
                cid: "",
                orderType: isBuy ? "buy" : "sell",
                margin: ExchangeTypes.UFixed256x18.wrap(margin),
                triggerPrice: ExchangeTypes.UFixed256x18.wrap(0)
            })
        );
    }
}
