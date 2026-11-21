import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Icon, platformIcon } from "../components/Icon";
import { QrCode } from "../components/QrCode";
import { Button, Modal, Spinner } from "../components/ui";
import { errorMessage, native, type PairingClaimed, type PairingSession } from "../lib/native";
import { PLATFORM_LABEL } from "../lib/status";
import { actions, useStore } from "../lib/store";

type Tab = "show" | "enter";

/**
 * Pairing, both directions:
 *  - "Show code": this device creates a session, shows QR + code, then approves the claimant after checking the SAS.
 *  - "Enter code": this device claims another device's code, shows the SAS and waits for approval there.
 */
export function PairDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("show");
  const request = useStore((s) => s.pairRequest);
  const approved = useStore((s) => s.lastPairApproved);

  useEffect(() => {
    if (open) actions.clearPairOutcome();
  }, [open]);

  const close = useCallback(() => {
    // Dismissing a pending request declines it, so the other device is not left waiting.
    if (request) void native.rejectPairing(request.pairingId).catch(() => {});
    actions.clearPairRequest();
    actions.clearPairOutcome();
    onClose();
  }, [onClose, request]);

  return (
    <Modal open={open} onClose={close} width={460}>
      {approved ? (
        <Success name={approved.name} platform={approved.platform} onDone={close} />
      ) : request ? (
        <ApproveRequest />
      ) : (
        <>
          <h2 className="text-[19px] font-semibold tracking-tight">Pair a device</h2>
          <p className="mt-1 text-[13px] text-fg-muted">Paired devices can send effects to each other.</p>
          <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-bg p-1 hairline">
            {(
              [
                ["show", "Show code", "qr"],
                ["enter", "Enter code", "keyboard"],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex items-center justify-center gap-2 rounded-md py-2 text-[13px] transition ${
                  tab === id ? "bg-surface-raised text-fg hairline" : "text-fg-muted hover:text-fg"
                }`}
              >
                <Icon name={icon} size={15} />
                {label}
              </button>
            ))}
          </div>
          <div className="mt-6">{tab === "show" ? <ShowCode /> : <EnterCode />}</div>
        </>
      )}
    </Modal>
  );
}

function ShowCode() {
  const [session, setSession] = useState<PairingSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const start = useCallback(async () => {
    setError(null);
    setSession(null);
    try {
      setSession(await native.createPairing());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (error) return <ErrorBlock message={error} onRetry={start} />;
  if (!session) return <Loading label="Creating a pairing code…" />;

  const remaining = Math.max(0, Math.round((session.expiresAt - now) / 1000));
  if (remaining === 0) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <p className="text-[14px] font-medium">This code expired</p>
        <p className="mt-1 text-[13px] text-fg-muted">Codes work for two minutes and only once.</p>
        <div className="mt-5">
          <Button icon="refresh" onClick={start}>
            New code
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center">
      <div className="rounded-xl bg-[#f4f5fb] p-3 shadow-[0_20px_60px_-20px_var(--color-accent)]">
        <QrCode size={session.qr.size} modules={session.qr.modules} />
      </div>
      <p className="mt-5 text-[13px] text-fg-muted">Scan with Synq on your phone, or type this code on another computer</p>
      <p className="mt-2 font-mono text-[26px] font-semibold tracking-[0.18em] select-text">{session.code}</p>
      <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-fg-faint">
        <Spinner size={11} /> Waiting for the other device · {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
      </p>
    </div>
  );
}

function ApproveRequest() {
  const request = useStore((s) => s.pairRequest)!;
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (kind: "approve" | "reject") => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "approve") await native.approvePairing(request.pairingId);
      else {
        await native.rejectPairing(request.pairingId);
        actions.clearPairRequest();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-surface-raised hairline">
        <Icon name={platformIcon(request.claimant.platform)} size={26} />
      </div>
      <h2 className="mt-4 text-[19px] font-semibold tracking-tight">Pair with {request.claimant.name}?</h2>
      <p className="mt-1 text-[13px] text-fg-muted">
        {PLATFORM_LABEL[request.claimant.platform]} · Check that the other device shows the same number.
      </p>
      <Sas digits={request.sas} />
      {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="ghost" onClick={() => act("reject")} busy={busy === "reject"} disabled={busy !== null}>
          Decline
        </Button>
        <Button icon="check" onClick={() => act("approve")} busy={busy === "approve"} disabled={busy !== null}>
          Numbers match
        </Button>
      </div>
    </div>
  );
}

function EnterCode() {
  const [code, setCode] = useState("");
  const [claimed, setClaimed] = useState<PairingClaimed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rejected = useStore((s) => s.lastPairRejected);

  const format = (raw: string) => {
    const clean = raw.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 10);
    return clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setClaimed(await native.claimPairing(code));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (claimed && rejected === claimed.pairingId) {
    return (
      <div className="py-4 text-center">
        <p className="text-[14px] font-medium">{claimed.initiator.name} declined the pairing</p>
        <div className="mt-5">
          <Button variant="ghost" onClick={() => (setClaimed(null), setCode(""), actions.clearPairOutcome())}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (claimed) {
    return (
      <div className="text-center">
        <p className="text-[13px] text-fg-muted">
          Confirm on <span className="text-fg">{claimed.initiator.name}</span> that it shows this number:
        </p>
        <Sas digits={claimed.sas} />
        <p className="inline-flex items-center gap-2 text-[12px] text-fg-faint">
          <Spinner size={11} /> Waiting for approval…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <label className="block text-[13px] text-fg-muted" htmlFor="pair-code">
        Code shown on the other device
      </label>
      <input
        id="pair-code"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        value={code}
        onChange={(e) => setCode(format(e.target.value))}
        placeholder="XXXXX-XXXXX"
        className="mt-2 w-full rounded-lg bg-bg px-4 py-3 text-center font-mono text-[22px] tracking-[0.18em] text-fg outline-none placeholder:text-fg-faint hairline focus:border-accent"
      />
      {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
      <div className="mt-5 flex justify-end">
        <Button type="submit" icon="link" busy={busy} disabled={code.replace("-", "").length !== 10}>
          Pair
        </Button>
      </div>
    </form>
  );
}

function Sas({ digits }: { digits: string }) {
  return (
    <div className="my-6 flex justify-center gap-2">
      {digits.split("").map((d, i) => (
        <span
          key={i}
          className={`grid h-14 w-11 place-items-center rounded-md bg-bg font-mono text-[26px] font-semibold hairline ${i === 3 ? "ml-3" : ""}`}
        >
          {d}
        </span>
      ))}
    </div>
  );
}

function Success({ name, platform, onDone }: { name: string; platform: string; onDone: () => void }) {
  return (
    <div className="py-4 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-online/15 text-online">
        <Icon name="check" size={26} />
      </div>
      <h2 className="mt-4 text-[19px] font-semibold tracking-tight">Paired with {name}</h2>
      <p className="mt-1 text-[13px] text-fg-muted">
        You can now send effects to your {PLATFORM_LABEL[platform as keyof typeof PLATFORM_LABEL] ?? "device"}.
      </p>
      <div className="mt-6">
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-[13px] text-fg-muted">
      <Spinner /> {label}
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <span className="text-danger">
        <Icon name="alert" size={22} />
      </span>
      <p className="mt-3 max-w-xs text-[13px] text-fg-muted">{message}</p>
      <div className="mt-5">
        <Button variant="ghost" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}
