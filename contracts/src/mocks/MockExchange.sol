// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Cosmos} from "../injective/CosmosTypes.sol";
import {ExchangeTypes} from "../injective/ExchangeTypes.sol";
import {IExchangeModule} from "../injective/Exchange.sol";
import {MockOracle} from "./MockOracle.sol";

/// @notice Mock of Injective's exchange precompile (0x…65). It keeps the same
/// function signatures and structs as IExchangeModule for the subset VEIL uses,
/// so VeilVault and the agent can be pointed at the real precompile unchanged.
///
/// Simplifications: there is no resting orderbook, a marketable order fills
/// immediately at the oracle mark; no fees or funding; one collateral denom.
/// Authz grants (approve/revoke) behave like the chain: per message type, with
/// an expiry and a spend limit that is consumed by margin the grantee commits.
contract MockExchange is Ownable {
    using Strings for uint256;

    type U is uint256;

    struct Position {
        bool isLong;
        uint256 quantity; // 1e18
        uint256 entryPrice; // 1e18
        uint256 margin; // 1e18
    }

    struct Grant {
        uint64 expiry;
        uint256 spendRemaining; // collateral native decimals
    }

    IERC20 public immutable collateral;
    MockOracle public immutable oracle;
    string public denom;
    uint256 public constant MAX_LEVERAGE = 25;
    uint256 public constant MAINTENANCE_BPS = 500; // 5% of notional
    uint256 private constant SCALE = 1e12; // 6-dec collateral -> 1e18

    string[] public markets;
    mapping(bytes32 => bool) public isMarket;
    mapping(bytes32 => uint256) public available; // subaccount -> free collateral (6 dec)
    mapping(bytes32 => mapping(bytes32 => Position)) private _pos; // subaccount -> market
    mapping(address => mapping(address => mapping(uint8 => Grant))) private _grants; // granter -> grantee -> msgType
    uint256 private _orderNonce;

    event Approval(address indexed granter, address indexed grantee, uint8 msgType, uint256 spendLimit, uint64 expiry);
    event Revoked(address indexed granter, address indexed grantee, uint8 msgType);
    event OrderFilled(
        string subaccountID, string marketID, address indexed sender, address indexed executor, bool isBuy,
        uint256 quantity, uint256 price, uint256 margin
    );
    event MarginIncreased(string subaccountID, string marketID, uint256 amount);
    event Liquidated(string subaccountID, string marketID, uint256 price);

    error NotAuthorized(address grantee, uint8 msgType);
    error AuthorizationExpired(address grantee, uint8 msgType, uint64 expiry);
    error SpendLimitExceeded(uint256 requested, uint256 remaining);
    error NotSubaccountOwner();
    error UnknownMarket();
    error OrderNotMarketable(uint256 limitPrice, uint256 mark);
    error InsufficientBalance(uint256 requested, uint256 availableBalance);
    error InsufficientMargin();
    error ReduceExceedsPosition();
    error NotLiquidatable();

    constructor(IERC20 collateral_, MockOracle oracle_, string memory denom_) Ownable(msg.sender) {
        collateral = collateral_;
        oracle = oracle_;
        denom = denom_;
    }

    function addMarket(string calldata marketID) external onlyOwner {
        bytes32 k = keccak256(bytes(marketID));
        if (!isMarket[k]) {
            isMarket[k] = true;
            markets.push(marketID);
        }
    }

    // ------------------------------------------------------------------ authz

    function approve(address grantee, IExchangeModule.Authorization[] calldata authorizations)
        external
        returns (bool)
    {
        for (uint256 i = 0; i < authorizations.length; i++) {
            uint8 t = ExchangeTypes.MsgType.unwrap(authorizations[i].method);
            uint256 limit = authorizations[i].spendLimit.length > 0
                ? authorizations[i].spendLimit[0].amount
                : type(uint256).max;
            uint64 expiry = uint64(block.timestamp + authorizations[i].duration);
            _grants[msg.sender][grantee][t] = Grant(expiry, limit);
            emit Approval(msg.sender, grantee, t, limit, expiry);
        }
        return true;
    }

    function revoke(address grantee, ExchangeTypes.MsgType[] calldata methods) external returns (bool) {
        for (uint256 i = 0; i < methods.length; i++) {
            uint8 t = ExchangeTypes.MsgType.unwrap(methods[i]);
            delete _grants[msg.sender][grantee][t];
            emit Revoked(msg.sender, grantee, t);
        }
        return true;
    }

    function allowance(address grantee, address granter, ExchangeTypes.MsgType method) external view returns (bool) {
        Grant storage g = _grants[granter][grantee][ExchangeTypes.MsgType.unwrap(method)];
        return g.expiry > block.timestamp;
    }

    /// @notice Mock-only view so UIs can show what is left of a mandate.
    function grantInfo(address granter, address grantee, uint8 msgType)
        external
        view
        returns (uint64 expiry, uint256 spendRemaining)
    {
        Grant storage g = _grants[granter][grantee][msgType];
        return (g.expiry, g.spendRemaining);
    }

    function _auth(address sender, ExchangeTypes.MsgType method, uint256 spend) internal {
        if (msg.sender == sender) return;
        uint8 t = ExchangeTypes.MsgType.unwrap(method);
        Grant storage g = _grants[sender][msg.sender][t];
        if (g.expiry == 0) revert NotAuthorized(msg.sender, t);
        if (block.timestamp >= g.expiry) revert AuthorizationExpired(msg.sender, t, g.expiry);
        if (spend > g.spendRemaining) revert SpendLimitExceeded(spend, g.spendRemaining);
        if (g.spendRemaining != type(uint256).max) g.spendRemaining -= spend;
    }

    // ------------------------------------------------------------ subaccounts

    function defaultSubaccountID(address owner_) public pure returns (string memory) {
        return (uint256(uint160(owner_)) << 96).toHexString(32);
    }

    function _sub(address sender, string memory subaccountID) internal pure returns (bytes32 k) {
        bytes32 def = keccak256(bytes(defaultSubaccountID(sender)));
        if (bytes(subaccountID).length == 0) return def;
        k = keccak256(bytes(subaccountID));
        if (k != def) revert NotSubaccountOwner();
    }

    function _mkt(string memory marketID) internal view returns (bytes32 k) {
        k = keccak256(bytes(marketID));
        if (!isMarket[k]) revert UnknownMarket();
    }

    function deposit(address sender, string calldata subaccountID, string calldata, uint256 amount)
        external
        returns (bool)
    {
        _auth(sender, ExchangeTypes.MsgType_Deposit, amount);
        bytes32 s = _sub(sender, subaccountID);
        // On Injective the precompile debits the bank balance directly; the
        // mock needs an ERC20 allowance instead.
        collateral.transferFrom(sender, address(this), amount);
        available[s] += amount;
        return true;
    }

    function withdraw(address sender, string calldata subaccountID, string calldata, uint256 amount)
        external
        returns (bool)
    {
        _auth(sender, ExchangeTypes.MsgType_Withdraw, 0);
        bytes32 s = _sub(sender, subaccountID);
        if (amount > available[s]) revert InsufficientBalance(amount, available[s]);
        available[s] -= amount;
        collateral.transfer(sender, amount);
        return true;
    }

    function subaccountDeposit(string calldata subaccountID, string calldata)
        external
        view
        returns (uint256 availableBalance, uint256 totalBalance)
    {
        bytes32 s = keccak256(bytes(subaccountID));
        availableBalance = available[s];
        totalBalance = availableBalance;
        for (uint256 i = 0; i < markets.length; i++) {
            totalBalance += _pos[s][keccak256(bytes(markets[i]))].margin / SCALE;
        }
    }

    function subaccountPositions(string calldata subaccountID)
        external
        view
        returns (IExchangeModule.DerivativePosition[] memory positions)
    {
        bytes32 s = keccak256(bytes(subaccountID));
        uint256 n;
        for (uint256 i = 0; i < markets.length; i++) {
            if (_pos[s][keccak256(bytes(markets[i]))].quantity > 0) n++;
        }
        positions = new IExchangeModule.DerivativePosition[](n);
        uint256 j;
        for (uint256 i = 0; i < markets.length; i++) {
            Position storage p = _pos[s][keccak256(bytes(markets[i]))];
            if (p.quantity == 0) continue;
            positions[j++] = IExchangeModule.DerivativePosition({
                subaccountID: subaccountID,
                marketID: markets[i],
                isLong: p.isLong,
                quantity: ExchangeTypes.UFixed256x18.wrap(p.quantity),
                entryPrice: ExchangeTypes.UFixed256x18.wrap(p.entryPrice),
                margin: ExchangeTypes.UFixed256x18.wrap(p.margin),
                cumulativeFundingEntry: 0
            });
        }
    }

    // ------------------------------------------------------------ derivatives

    function createDerivativeLimitOrder(address sender, IExchangeModule.DerivativeOrder calldata order)
        external
        returns (IExchangeModule.CreateDerivativeLimitOrderResponse memory response)
    {
        uint256 qty = ExchangeTypes.UFixed256x18.unwrap(order.quantity);
        uint256 limit = ExchangeTypes.UFixed256x18.unwrap(order.price);
        uint256 margin = ExchangeTypes.UFixed256x18.unwrap(order.margin);
        _auth(sender, ExchangeTypes.MsgType_CreateDerivativeLimitOrder, margin / SCALE);

        bytes32 s = _sub(sender, order.subaccountID);
        bytes32 m = _mkt(order.marketID);
        uint256 mark = oracle.price(order.marketID);
        bool isBuy = keccak256(bytes(order.orderType)) == keccak256("buy");
        if (isBuy ? limit < mark : limit > mark) revert OrderNotMarketable(limit, mark);

        Position storage p = _pos[s][m];
        if (p.quantity == 0 || p.isLong == isBuy) {
            uint256 notional = (qty * mark) / 1e18;
            if (margin * MAX_LEVERAGE < notional) revert InsufficientMargin();
            uint256 m6 = margin / SCALE;
            if (m6 > available[s]) revert InsufficientBalance(m6, available[s]);
            available[s] -= m6;
            p.entryPrice = (p.entryPrice * p.quantity + mark * qty) / (p.quantity + qty);
            p.quantity += qty;
            p.margin += margin;
            p.isLong = isBuy;
        } else {
            if (qty > p.quantity) revert ReduceExceedsPosition();
            int256 pnl = (int256(qty) * (int256(mark) - int256(p.entryPrice))) / 1e18;
            if (!p.isLong) pnl = -pnl;
            uint256 released = (p.margin * qty) / p.quantity;
            int256 payout = int256(released) + pnl;
            if (payout > 0) available[s] += uint256(payout) / SCALE;
            p.quantity -= qty;
            p.margin -= released;
            if (p.quantity == 0) delete _pos[s][m];
        }

        emit OrderFilled(order.subaccountID, order.marketID, sender, msg.sender, isBuy, qty, mark, margin);
        response.orderHash = uint256(keccak256(abi.encode(++_orderNonce, sender))).toHexString(32);
        response.cid = order.cid;
    }

    function increasePositionMargin(
        address sender,
        string calldata sourceSubaccountID,
        string calldata destinationSubaccountID,
        string calldata marketID,
        ExchangeTypes.UFixed256x18 amount
    ) external returns (bool) {
        uint256 a = ExchangeTypes.UFixed256x18.unwrap(amount);
        uint256 a6 = a / SCALE;
        _auth(sender, ExchangeTypes.MsgType_IncreasePositionMargin, a6);
        bytes32 s = _sub(sender, sourceSubaccountID);
        Position storage p = _pos[_sub(sender, destinationSubaccountID)][_mkt(marketID)];
        require(p.quantity > 0, "no position");
        if (a6 > available[s]) revert InsufficientBalance(a6, available[s]);
        available[s] -= a6;
        p.margin += a6 * SCALE;
        emit MarginIncreased(destinationSubaccountID, marketID, a);
        return true;
    }

    /// @notice Anyone can liquidate a position whose equity is below maintenance.
    function liquidate(string calldata subaccountID, string calldata marketID) external {
        bytes32 s = keccak256(bytes(subaccountID));
        bytes32 m = _mkt(marketID);
        Position storage p = _pos[s][m];
        uint256 mark = oracle.price(marketID);
        int256 pnl = (int256(p.quantity) * (int256(mark) - int256(p.entryPrice))) / 1e18;
        if (!p.isLong) pnl = -pnl;
        int256 equity = int256(p.margin) + pnl;
        uint256 maintenance = (p.quantity * mark * MAINTENANCE_BPS) / (1e18 * 10_000);
        if (p.quantity == 0 || equity >= int256(maintenance)) revert NotLiquidatable();
        delete _pos[s][m]; // remaining margin goes to the insurance fund
        emit Liquidated(subaccountID, marketID, mark);
    }
}
