"use client";

/** The card you see before sitting down at any table: what loads, and a button. */
export function Lobby({ title, body, action, onStart, children }: {
  title: string; body: string; action: string; onStart: () => void; children?: React.ReactNode;
}) {
  return (
    <div className="glass p-10 text-center">
      <h3 className="t-title">{title}</h3>
      <p className="t-body mx-auto mt-3 max-w-md">{body}</p>
      {children && <div className="mt-5 flex justify-center">{children}</div>}
      <button onClick={onStart} className="btn-primary mt-6">{action}</button>
    </div>
  );
}

/** The table's frame: same height rules as the mahjong room so every game feels like one place. */
export const TABLE_FRAME = "relative w-full h-[62vh] lg:h-[min(calc(100vh-24.5rem),58vw)]";
export const NAMES = ["You", "Otto", "Mira", "Kip"];
