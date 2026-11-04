"use client"

import * as React from "react"
import {
  agentDecisions,
  agentStatus,
  connectDemo,
  connectInjected,
  disconnect as sdkDisconnect,
  injected,
  sessionStillValid,
  setInjectedAccount,
  getConfig,
  getCredential,
  getWallets,
  readState,
  type AgentDecision,
  type AgentStatus,
  type Credential,
  type DemoWallet,
  type VeilConfig,
  type VeilState,
  type WalletId,
} from "@/lib/veil/client"

const STATE_MS = 2000
const AGENT_MS = 3000

export type AgentInfo = {
  /** null until the first probe finishes */
  online: boolean | null
  status: AgentStatus | null
  decisions: AgentDecision[]
  error: string | null
}

type VeilContextValue = {
  config: VeilConfig | null
  configError: string | null
  wallets: { you: DemoWallet | null; friend: DemoWallet } | null
  /** The connected wallet ("you"), null until the user connects. */
  account: DemoWallet | null
  /** false until localStorage has been read, so pages can avoid flashing the connect prompt. */
  ready: boolean
  connect: (kind: "injected" | "demo") => Promise<void>
  disconnect: () => void
  state: VeilState | null
  stateError: string | null
  agent: AgentInfo
  credentials: Record<WalletId, Credential | null>
  /** Display name for "you" from the stored credential, null before KYC. */
  userName: string | null
  /** Re-read credentials from localStorage (after requestCredential). */
  reloadCredentials: () => void
  /** Poll chain + agent right now. */
  refresh: () => void
  /** Serialise transactions per burner wallet so nonces never collide. */
  withWallet: <T>(id: WalletId, fn: () => Promise<T>) => Promise<T>
}

const VeilContext = React.createContext<VeilContextValue | null>(null)

export function useVeil(): VeilContextValue {
  const ctx = React.useContext(VeilContext)
  if (!ctx) throw new Error("useVeil must be used inside <VeilProvider>")
  return ctx
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function VeilProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = React.useState<VeilConfig | null>(null)
  const [configError, setConfigError] = React.useState<string | null>(null)
  const [wallets, setWallets] = React.useState<{ you: DemoWallet | null; friend: DemoWallet } | null>(null)
  const [ready, setReady] = React.useState(false)
  const [state, setState] = React.useState<VeilState | null>(null)
  const [stateError, setStateError] = React.useState<string | null>(null)
  const [agent, setAgent] = React.useState<AgentInfo>({ online: null, status: null, decisions: [], error: null })
  const [credentials, setCredentials] = React.useState<Record<WalletId, Credential | null>>({ you: null, friend: null })

  const stateBusy = React.useRef(false)
  const agentBusy = React.useRef(false)
  const locks = React.useRef<Record<WalletId, Promise<unknown>>>({ you: Promise.resolve(), friend: Promise.resolve() })

  const pollState = React.useCallback(async () => {
    if (stateBusy.current) return
    stateBusy.current = true
    try {
      const s = await readState()
      setState(s)
      setStateError(null)
    } catch (e) {
      setStateError(errMsg(e))
    } finally {
      stateBusy.current = false
    }
  }, [])

  const pollAgent = React.useCallback(async () => {
    if (agentBusy.current) return
    agentBusy.current = true
    try {
      const [status, decisions] = await Promise.all([agentStatus(), agentDecisions()])
      setAgent({ online: true, status, decisions, error: null })
    } catch (e) {
      // keep the last known decisions so the feed doesn't vanish on a blip
      setAgent((a) => ({ online: false, status: null, decisions: a.decisions, error: errMsg(e) }))
    } finally {
      agentBusy.current = false
    }
  }, [])

  const reloadCredentials = React.useCallback(() => {
    setCredentials({ you: getCredential("you"), friend: getCredential("friend") })
  }, [])

  const refresh = React.useCallback(() => {
    void pollState()
    void pollAgent()
  }, [pollState, pollAgent])

  // bootstrap: config, wallets, credentials
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const c = await getConfig()
        if (cancelled) return
        setConfig(c)
        setConfigError(null)
      } catch (e) {
        if (!cancelled) setConfigError(errMsg(e))
      }
      if (cancelled) return
      // a saved browser-wallet session is only kept if the wallet still authorises that account
      if (!(await sessionStillValid())) sdkDisconnect()
      if (cancelled) return
      setWallets(getWallets())
      setCredentials({ you: getCredential("you"), friend: getCredential("friend") })
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // polling loops
  React.useEffect(() => {
    void pollState()
    const id = window.setInterval(() => void pollState(), STATE_MS)
    return () => window.clearInterval(id)
  }, [pollState])

  React.useEffect(() => {
    void pollAgent()
    const id = window.setInterval(() => void pollAgent(), AGENT_MS)
    return () => window.clearInterval(id)
  }, [pollAgent])

  const syncWallets = React.useCallback(() => {
    setWallets(getWallets())
    setCredentials({ you: getCredential("you"), friend: getCredential("friend") })
    void pollState()
  }, [pollState])

  const connect = React.useCallback(async (kind: "injected" | "demo") => {
    if (kind === "injected") await connectInjected()
    else connectDemo()
    syncWallets()
  }, [syncWallets])

  const disconnect = React.useCallback(() => {
    sdkDisconnect()
    syncWallets()
  }, [syncWallets])

  // follow account switches made inside the browser wallet
  const youKind = wallets?.you?.kind
  React.useEffect(() => {
    const eth = injected()
    if (youKind !== "injected" || !eth?.on) return
    const onAccounts = (...a: unknown[]) => {
      const accounts = a[0] as `0x${string}`[]
      if (accounts?.[0]) setInjectedAccount(accounts[0])
      else sdkDisconnect()
      syncWallets()
    }
    eth.on("accountsChanged", onAccounts)
    return () => eth.removeListener?.("accountsChanged", onAccounts)
  }, [youKind, syncWallets])

  const withWallet = React.useCallback(<T,>(id: WalletId, fn: () => Promise<T>): Promise<T> => {
    const prev = locks.current[id]
    const next = prev.catch(() => undefined).then(fn)
    locks.current[id] = next.catch(() => undefined)
    return next
  }, [])

  const value = React.useMemo<VeilContextValue>(
    () => ({
      config, configError, wallets, account: wallets?.you ?? null, ready, connect, disconnect, state, stateError, agent, credentials,
      userName: credentials.you?.name ?? null,
      reloadCredentials, refresh, withWallet,
    }),
    [config, configError, wallets, ready, connect, disconnect, state, stateError, agent, credentials, reloadCredentials, refresh, withWallet]
  )

  return <VeilContext.Provider value={value}>{children}</VeilContext.Provider>
}

/** Wall-clock that ticks every second (for countdowns). 0 until mounted, so SSR and hydration agree. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = React.useState(0)
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
