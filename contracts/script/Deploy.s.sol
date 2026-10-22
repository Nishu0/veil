// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
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

/// Deploys the whole VEIL stack (with mocks for USDT, T-bill, oracle and the
/// exchange precompile) and writes deployments/<chainId>.json.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address agent = vm.envAddress("AGENT_ADDRESS");
        string memory market = Strings.toHexString(uint256(keccak256("TSLA/USDT iAsset PERP")), 32);

        vm.startBroadcast(pk);
        MockUSDT usdt = new MockUSDT();
        MockTBill tbill = new MockTBill(usdt);
        usdt.setMinter(address(tbill), true);
        MockOracle oracle = new MockOracle();
        MockExchange exchange = new MockExchange(usdt, oracle, "usdt");
        exchange.addMarket(market);
        oracle.setPrice(market, 300e18);

        Groth16Verifier verifier = new Groth16Verifier();
        ZkComplianceRegistry registry = new ZkComplianceRegistry(
            IGroth16Verifier(address(verifier)), vm.envUint("ISSUER_AX"), vm.envUint("ISSUER_AY"), [uint256(408), 364, 760]
        );
        VeilPermissionsHook hook = new VeilPermissionsHook(registry);
        VeilVault vault = new VeilVault(
            usdt, ITBill(address(tbill)), IExchangeModule(address(exchange)), IPriceOracle(address(oracle)), registry, market, "usdt"
        );
        VRWA vrwa = new VRWA(address(vault), hook);
        vault.setShareToken(vrwa);
        hook.setExempt(address(vault), true);

        AgentLog agentLog = new AgentLog();
        agentLog.setAgent(agent, true);
        vault.grantMandate(agent, 2_500e6, 7 days);
        if (agent.balance < 0.05 ether) payable(agent).transfer(0.2 ether);
        vm.stopBroadcast();

        string memory o = "d";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeString(o, "marketID", market);
        vm.serializeString(o, "subaccountID", vault.subaccountID());
        vm.serializeAddress(o, "deployer", vm.addr(pk));
        vm.serializeAddress(o, "agent", agent);
        vm.serializeAddress(o, "usdt", address(usdt));
        vm.serializeAddress(o, "tbill", address(tbill));
        vm.serializeAddress(o, "oracle", address(oracle));
        vm.serializeAddress(o, "exchange", address(exchange));
        vm.serializeAddress(o, "verifier", address(verifier));
        vm.serializeAddress(o, "registry", address(registry));
        vm.serializeAddress(o, "hook", address(hook));
        vm.serializeAddress(o, "vault", address(vault));
        vm.serializeAddress(o, "vrwa", address(vrwa));
        string memory out = vm.serializeAddress(o, "agentLog", address(agentLog));
        vm.writeJson(out, string.concat("deployments/", vm.toString(block.chainid), ".json"));
        console.log("VEIL deployed. vault:", address(vault));
    }
}
