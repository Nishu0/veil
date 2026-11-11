import Link from "next/link";
import { ArrowRight, Check, FlaskConical } from "lucide-react";
import { VeilMark } from "@/components/veil/ui";
import { GapGuardPanel, MandatePanel } from "@/components/veil/risk-panels";
import { HeroTunnel } from "@/components/veil/hero-tunnel";
import { HeroOrb } from "@/components/veil/hero-orb";
import { LandingNav } from "@/components/veil/landing-nav";

const Rule = () => <div className="lp-rule" aria-hidden />;

export default function Landing() {
  return (
    <div className="lp">
      <LandingNav>
        <div className="lp-frame">
          <nav className="lp-nav">
            <Link href="/" className="lp-brand"><span><VeilMark size={17} /></span>Veil</Link>
            <div className="lp-links">
              <a href="#privacy">Privacy</a><a href="#agent">Agent</a><a href="#how">How it works</a><a href="#demo">The demo</a>
            </div>
            <Link href="/dashboard" className="v-btn is-primary">Launch app</Link>
          </nav>
        </div>
        <Rule />
      </LandingNav>

      <section className="hx">
        <HeroTunnel />
        <div className="hx-vignette" aria-hidden />
        <div className="hx-grid">
          <h1 className="hx-h1"><span>Prove you’re allowed.</span><span>Stay <em>private.</em></span></h1>
          <div className="hx-orb" aria-hidden>
<HeroOrb />
            <span className="hx-disc"><VeilMark size={58} /></span>
          </div>
          <div className="hx-copy">
            <p>Veil is a private, compliant prime account for real-world assets on Injective. A zero-knowledge credential replaces the public KYC allowlist, and a bounded AI agent hedges your book through the weekend.</p>
            <div className="hx-cta">
              <Link href="/dashboard" className="v-btn is-primary is-lg">Launch app<ArrowRight /></Link>
              <a href="#how" className="v-btn is-lg">See how it works</a>
            </div>
          </div>
        </div>
        <span className="hx-foot"><i />Built on <b>Injective</b> · testnet demo</span>
      </section>
      <Rule />


      <div className="lp-frame">
        <section className="lp-section">
          <p className="lp-statement">
            <span>Public allowlists doxx every holder.</span>
            <span>Equity oracles sleep through the weekend.</span>
            <span>Trading agents get the whole wallet.</span>
          </p>
        </section>
      </div>
      <Rule />

      <div className="lp-frame">
        <section className="lp-section" id="privacy">
          <div className="lp-head">
            <p className="lp-over">Privacy</p>
            <h2 className="lp-h2">Prove it <em>without</em> showing it</h2>
            <p>An issuer signs your credential once. Your browser turns it into a Groth16 proof, and a verifier contract checks it. The registry keeps a nullifier and an expiry, and nothing that points back to you.</p>
          </div>
          <div className="lp-panel">
            <div className="lp-ledger">
              <div>
                <h3>What the chain stores</h3>
                <dl>
                  <div><dt>Wallet</dt><dd className="is-mono">0x7a3f…c21e</dd></div>
                  <div><dt>Nullifier</dt><dd className="is-mono">0x1f9c…a04b</dd></div>
                  <div><dt>Valid until</dt><dd>10 Dec 2026</dd></div>
                  <div><dt>Identity</dt><dd>none</dd></div>
                </dl>
              </div>
              <div>
                <h3>What stays with you</h3>
                <dl>
                  <div><dt>Name</dt><dd><span className="lp-redact">Nisarg Thakkar</span></dd></div>
                  <div><dt>Jurisdiction</dt><dd><span className="lp-redact">India</span></dd></div>
                  <div><dt>Accredited investor</dt><dd><span className="lp-redact">Yes</span></dd></div>
                  <div><dt>KYC documents</dt><dd><span className="lp-redact">passport.pdf</span></dd></div>
                </dl>
                <small>Hover to reveal. Stored in your browser only.</small>
              </div>
            </div>
          </div>
        </section>
      </div>
      <Rule />

      <div className="lp-frame">
        <section className="lp-section" id="agent">
          <div className="lp-head">
            <p className="lp-over">Risk</p>
            <h2 className="lp-h2">Two risks, both <em>bounded</em></h2>
            <p>The weekend gap is priced in before the close, and the agent that does it can only act inside a mandate the exchange enforces.</p>
          </div>
          <div className="lp-two">
            <GapGuardPanel />
            <MandatePanel />
          </div>
        </section>
      </div>
      <Rule />

      <div className="lp-frame">
        <section className="lp-section" id="how">
          <div className="lp-flowlist">
            <div>
              <div className="lp-head is-left">
                <p className="lp-over">How it works</p>
                <h2 className="lp-h2">Five steps, all <em>on-chain</em></h2>
                <p>Connect a wallet and run them yourself. Each one is a real transaction against the deployed contracts.</p>
              </div>
              <Link href="/dashboard" className="v-btn is-primary is-lg">Run the demo<ArrowRight /></Link>
            </div>
            <ol>
              <li><b>Get a credential</b><span>Mock KYC signs your attributes. The issuer only sees a commitment to your secret.</span></li>
              <li><b>Prove and register</b><span>Your browser builds the proof; <code>ZkComplianceRegistry</code> stores a nullifier and an expiry.</span></li>
              <li><b>Deposit, receive vRWA</b><span>USDT is split across T-bills, exchange margin and idle cash. Shares are minted to you.</span></li>
              <li><b>Transfer, with compliance</b><span><code>VeilPermissionsHook</code> rejects vRWA sent to any wallet without a valid credential.</span></li>
              <li><b>Let the agent hedge</b><span>It trades the vault subaccount under its mandate and logs <code>keccak256(decision)</code>.</span></li>
            </ol>
          </div>
        </section>
      </div>
      <Rule />

      <div className="lp-frame">
        <section className="lp-section" id="demo">
          <div className="lp-head">
            <p className="lp-over">The demo</p>
            <h2 className="lp-h2">Honest about what is <em>real</em></h2>
          </div>
          <div className="lp-real">
            <div className="lp-panel"><div className="lp-panel-body">
              <h3>Real</h3>
              <ul>
                <li><Check color="#23804f" />Groth16 circuit, in-browser prover and on-chain verifier</li>
                <li><Check color="#23804f" />Registry, permissions hook, vRWA token, vault and NAV</li>
                <li><Check color="#23804f" />Agent policy, execution, LLM rationale and hash commitments</li>
                <li><Check color="#23804f" />Exchange interface identical to Injective&apos;s precompile for the calls used</li>
              </ul>
            </div></div>
            <div className="lp-panel"><div className="lp-panel-body">
              <h3>Mocked for testnet</h3>
              <ul>
                <li><FlaskConical color="#a8741f" />KYC issuer approves anyone</li>
                <li><FlaskConical color="#a8741f" />USDT and the tokenized T-bill</li>
                <li><FlaskConical color="#a8741f" />Price oracle, with the weekend freeze</li>
                <li><FlaskConical color="#a8741f" />Exchange matching: orders fill at the mark, no fees or funding</li>
              </ul>
            </div></div>
          </div>
        </section>
      </div>
      <Rule />

      <div className="lp-frame">
        <section className="lp-final">
          <h2 className="lp-h2">See it run <em>end to end.</em></h2>
          <p>Enter a name, prove it, invest, and watch the agent work.</p>
          <Link href="/dashboard" className="v-btn is-primary is-lg">Launch app<ArrowRight /></Link>
        </section>
      </div>
      <Rule />
      <div className="lp-frame">
        <footer className="lp-footer">
          <span className="lp-brand" style={{ fontSize: 15 }}><span style={{ width: 22, height: 22 }}><VeilMark size={14} /></span>Veil</span>
          <span>Private RWA prime account on Injective. Testnet demo, not investment advice.</span>
          <nav><a href="#privacy">Privacy</a><a href="#agent">Agent</a><Link href="/dashboard">App</Link></nav>
        </footer>
      </div>
    </div>
  );
}
