"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useLocalT } from "@/lib/i18n";
import { dict } from "./dict";
import { useMedia } from "@/lib/useMedia";
import { useBodyKind } from "@/lib/sim/body";
import { TableScene } from "@/lib/three/tableScene";
import { FlyBrains, type BrainsApi, TABLE_SEATS } from "@/experiments/shared/FlyBrains";
import { brainChoose, brainTeach, codeOf, type Candidate } from "@/experiments/shared/brainPlay";
import * as THREE from "three";
import {
  createGame,
  applyAction,
  getLegalActions,
  evaluateHand,
  getHandName,
  cardToString,
  type GameState,
} from "./engine";
import { getBestActions, type ScoredAction } from "./bot";

/**
 * Texas Hold'em Poker table
 */
export function PokerTable() {
  const { t, lang } = useT();
  const { lt } = useLocalT(dict);
  const wide = useMedia("(min-width: 1024px)");
  const bodyKind = useBodyKind();

  const containerRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<GameState>(() => createGame(4, 1000));
  const [thinking, setThinking] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(50);
  const brainsRef = useRef<BrainsApi | null>(null);

  const ts = useRef<TableScene | null>(null);
  const cardMeshes = useRef<Map<string, THREE.Mesh>>(new Map());

  const humanSeat = 0;

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new TableScene(containerRef.current, {
      body: bodyKind,
      set: "saloon",
      mat: { shape: "round", size: 1.2, texture: "velvet", color: 0x2d5016 },
      hat: "cowboy",
      presets: {
        main: { pos: [0, 0.5, 1.2], look: [0, 0, 0], fov: 50 },
      },
      view: "main",
      seated: [0, 1, 2, 3],
    });

    ts.current = scene;
    createCardMeshes(scene);
    layoutCards(game);

    return () => {
      scene.dispose();
      ts.current = null;
    };
  }, [bodyKind]);

  useEffect(() => {
    if (game.status !== "active" || game.currentPlayer === humanSeat || thinking) return;

    const timer = setTimeout(() => {
      botTurn(game);
    }, 1000);

    return () => clearTimeout(timer);
  }, [game, thinking]);

  const createCardMeshes = (scene: TableScene) => {
    const tableTop = scene.tableTop;
    const cardWidth = 0.1;
    const cardHeight = 0.14;
    const cardThickness = 0.01;

    const geom = new THREE.BoxGeometry(cardWidth, cardThickness, cardHeight);
    const backMat = new THREE.MeshStandardMaterial({ color: 0xcc3333 });

    for (let seat = 0; seat < 4; seat++) {
      for (let i = 0; i < 2; i++) {
        const key = `player${seat}-${i}`;
        const mesh = new THREE.Mesh(geom, backMat.clone());
        mesh.castShadow = true;
        mesh.visible = false;
        scene.scene.add(mesh);
        cardMeshes.current.set(key, mesh);
      }
    }

    for (let i = 0; i < 5; i++) {
      const key = `community-${i}`;
      const frontMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(geom, frontMat.clone());
      mesh.castShadow = true;
      mesh.visible = false;
      scene.scene.add(mesh);
      cardMeshes.current.set(key, mesh);
    }
  };

  const layoutCards = (state: GameState) => {
    const scene = ts.current;
    if (!scene) return;

    const tableTop = scene.tableTop;
    const cardSpacing = 0.12;

    for (let seat = 0; seat < 4; seat++) {
      const player = state.players[seat];
      if (!player || player.folded) {
        for (let i = 0; i < 2; i++) {
          const mesh = cardMeshes.current.get(`player${seat}-${i}`);
          if (mesh) mesh.visible = false;
        }
        continue;
      }

      for (let i = 0; i < 2; i++) {
        const mesh = cardMeshes.current.get(`player${seat}-${i}`);
        if (!mesh) continue;

        mesh.visible = true;

        const seatGroup = scene.seats[seat];
        const local = new THREE.Vector3((i - 0.5) * cardSpacing, 0, -0.3);
        const world = seatGroup.localToWorld(local.clone());

        mesh.position.copy(world);
        mesh.position.y = tableTop + 0.02;
        mesh.rotation.y = Math.PI * seat / 2;

        if (seat === humanSeat) {
          (mesh.material as THREE.MeshStandardMaterial).color.setHex(0xffffff);
        }
      }
    }

    for (let i = 0; i < 5; i++) {
      const mesh = cardMeshes.current.get(`community-${i}`);
      if (!mesh) continue;

      if (i < state.community.length) {
        mesh.visible = true;
        mesh.position.set((i - 2) * cardSpacing, tableTop + 0.02, 0);
        mesh.rotation.set(0, 0, 0);
      } else {
        mesh.visible = false;
      }
    }
  };

  const handleAction = async (action: "fold" | "call" | "raise") => {
    if (game.status !== "active" || game.currentPlayer !== humanSeat || thinking) return;

    const newGame = JSON.parse(JSON.stringify(game)) as GameState;
    applyAction(newGame, action, action === "raise" ? raiseAmount : 0);
    setGame(newGame);
    layoutCards(newGame);

    if (brainsRef.current) {
      const code = codeOf(action + (action === "raise" ? raiseAmount : ""));
      await brainTeach(brainsRef.current, humanSeat, [code], 1);
    }
  };

  const botTurn = async (currentGame: GameState) => {
    setThinking(true);

    const botSeat = currentGame.currentPlayer;
    const candidates = getBestActions(currentGame, botSeat);

    if (candidates.length === 0) {
      setThinking(false);
      return;
    }

    let chosen = candidates[0];

    if (brainsRef.current) {
      const cands: Candidate<ScoredAction>[] = candidates.map(c => ({
        item: c,
        code: codeOf(c.action + (c.raiseAmount || "")),
      }));

      const result = await brainChoose(brainsRef.current, botSeat, cands, "like");
      if (result) {
        chosen = result.item;
      }
    }

    const newGame = JSON.parse(JSON.stringify(currentGame)) as GameState;
    applyAction(newGame, chosen.action, chosen.raiseAmount || 0);
    setGame(newGame);
    layoutCards(newGame);

    setThinking(false);
  };

  const handleNewGame = () => {
    const newGame = createGame(4, 1000);
    setGame(newGame);
    setThinking(false);
    layoutCards(newGame);
  };

  const handleBrainsApi = (api: BrainsApi | null) => {
    brainsRef.current = api;
  };

  const legalActions = game.currentPlayer === humanSeat ? getLegalActions(game) : [];
  const humanPlayer = game.players[humanSeat];

  const statusText = game.status === "won"
    ? `${lt("msg.winner")}: ${lt("msg.chips")} ${game.players[game.winner!].chips}`
    : game.currentPlayer === humanSeat
    ? lt("msg.yourTurn")
    : lt("status.playing");

  const brainNames = game.players.map((_, i) => `${lt("msg.chips")} ${game.players[i].chips}`);

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 relative" ref={containerRef} />

      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
        <div className="pointer-events-auto">
          <button
            onClick={handleNewGame}
            className="px-4 py-2 bg-white/90 hover:bg-white rounded-lg shadow-lg"
          >
            {lt("action.newGame")}
          </button>
        </div>

        <div className="bg-white/90 rounded-lg shadow-lg px-4 py-2">
          <div className="font-medium">{statusText}</div>
          <div className="text-sm">{lt(("phase." + game.phase) as any)}</div>
          <div className="text-sm">{lt("msg.pot")}: {game.pot}</div>
        </div>
      </div>

      <div className="absolute top-20 left-4 bg-white/90 rounded-lg shadow-lg p-3 pointer-events-none">
        <div className="text-sm font-medium">{lt("msg.chips")}: {humanPlayer.chips}</div>
        {humanPlayer.hand.length > 0 && (
          <div className="text-sm">
            {humanPlayer.hand.map((c, i) => (
              <span key={i} className="mr-1">{cardToString(c)}</span>
            ))}
          </div>
        )}
        {game.community.length > 0 && (
          <div className="text-sm mt-1">
            {getHandName(evaluateHand(humanPlayer.hand, game.community).rank)}
          </div>
        )}
      </div>

      {legalActions.length > 0 && game.status === "active" && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-white/90 rounded-lg shadow-lg p-4 pointer-events-auto">
          <div className="flex gap-3">
            {legalActions.includes("fold") && (
              <button
                onClick={() => handleAction("fold")}
                className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg"
              >
                {lt("action.fold")}
              </button>
            )}
            {legalActions.includes("call") && (
              <button
                onClick={() => handleAction("call")}
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
              >
                {lt("action.call")} ({game.currentBet - humanPlayer.bet})
              </button>
            )}
            {legalActions.includes("raise") && (
              <div className="flex gap-2">
                <input
                  type="number"
                  value={raiseAmount}
                  onChange={(e) => setRaiseAmount(parseInt(e.target.value) || 0)}
                  className="w-24 px-3 py-2 border rounded-lg"
                  min={game.currentBet}
                  max={humanPlayer.chips}
                />
                <button
                  onClick={() => handleAction("raise")}
                  className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg"
                >
                  {lt("action.raise")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {wide ? (
        <FlyBrains
          names={brainNames}
          labelOf={(seat) => `${lt("msg.chips")} ${game.players[seat].chips}`}
          active={game.status === "active" ? game.currentPlayer : null}
          enabled={true}
          onApi={handleBrainsApi}
          variant="overlay"
          seats={TABLE_SEATS}
        />
      ) : (
        <div className="bg-white border-t border-gray-200">
          <FlyBrains
            names={brainNames}
            labelOf={(seat) => `${lt("msg.chips")} ${game.players[seat].chips}`}
            active={game.status === "active" ? game.currentPlayer : null}
            enabled={true}
            onApi={handleBrainsApi}
            variant="strip"
            seats={TABLE_SEATS}
          />
        </div>
      )}
    </div>
  );
}
