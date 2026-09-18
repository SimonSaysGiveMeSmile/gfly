"use client";

import { usePathname } from "next/navigation";

/**
 * The door to a room. Its own still fills the frame, the same height the
 * table will take, and the words sit on it at the bottom left: what this
 * is, what loads, the choices, and one button. The still breathes slowly;
 * the words rise in turn.
 */
export function Lobby({ title, body, action, onStart, children }: {
  title: string; body: string; action: string; onStart: () => void; children?: React.ReactNode;
}) {
  const path = usePathname();
  const slug = path?.split("/").filter(Boolean).at(-1);
  const still = slug ? `/previews/${slug}.jpg` : null;
  return (
    <div className={`lobby ${TABLE_FRAME}`}>
      {still && <img src={still} alt="" className="lobby-still" />}
      <div className="lobby-veil" aria-hidden />
      <div className="lobby-copy">
        <h3 className="rise text-[clamp(1.7rem,3.2vw,2.4rem)] font-semibold leading-[1.05] tracking-[-0.01em] text-label" style={{ animationDelay: "60ms" }}>{title}</h3>
        <p className="rise t-body mt-3 max-w-[34rem] text-label-2" style={{ animationDelay: "140ms" }}>{body}</p>
        {children && <div className="rise mt-5 flex flex-wrap items-center gap-2" style={{ animationDelay: "220ms" }}>{children}</div>}
        <button onClick={onStart} className="btn-primary lobby-go rise mt-6" style={{ animationDelay: "300ms" }}>{action}{" "}<span aria-hidden>→</span></button>
      </div>
    </div>
  );
}

/** The table's frame: same height rules as the mahjong room so every game feels like one place. */
export const TABLE_FRAME = "relative w-full h-[62vh] lg:h-[max(30rem,calc(100vh-14.5rem))]";
export const NAMES = ["You", "Otto", "Mira", "Kip"];
