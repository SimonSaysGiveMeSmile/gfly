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
  generateLegalMoves,
  applyMove,
  isInCheck,
  posToString,
  moveToString,
  type GameState,
  type Move,
  type Position,
  type Color,
} from "./engine";
import { getBestMoves } from "./bot";

/**
 * Xiangqi (Chinese Chess) table for 2 players
 */
export function XiangqiTable() {
  const { t, lang } = useT();
  const { lt } = useLocalT(dict);
  const wide = useMedia("(min-width: 1024px)");
  const bodyKind = useBodyKind();

  const containerRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<GameState>(createGame);
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [thinking, setThinking] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const brainsRef = useRef<BrainsApi | null>(null);

  const ts = useRef<TableScene | null>(null);
  const meshes = useRef<Map<string, THREE.Mesh>>(new Map());
  const targetPositions = useRef<Map<string, { pos: THREE.Vector3; rot: THREE.Quaternion }>>(new Map());

  const humanSeat = 0;
  const humanColor: Color = "red";

  // Initialize scene
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new TableScene(containerRef.current, {
      body: bodyKind,
      set: "tea",
      mat: { shape: "square", size: 1.0, texture: "cloth", color: 0xd4a574 },
      presets: {
        main: { pos: [0, 0.5, 1.2], look: [0, 0, 0], fov: 50 },
      },
      view: "main",
      seated: [0, 2],
    });

    ts.current = scene;
    createBoardMeshes(scene);
    layoutPieces(game.board.squares);

    scene.pickables = Array.from(meshes.current.values());
    scene.onPick = handlePick;

    scene.onFrame = (dt) => {
      for (const [key, mesh] of meshes.current.entries()) {
        const target = targetPositions.current.get(key);
        if (target) {
          mesh.position.lerp(target.pos, Math.min(1, dt * 8));
          mesh.quaternion.slerp(target.rot, Math.min(1, dt * 8));
        }
      }
    };

    return () => {
      scene.dispose();
      ts.current = null;
    };
  }, [bodyKind]);

  const createBoardMeshes = (scene: TableScene) => {
    const tableTop = scene.tableTop;
    const fileSize = 0.15;
    const rankSize = 0.15;
    const boardWidth = fileSize * 8;
    const boardHeight = rankSize * 9;
    const boardThickness = 0.02;

    // Board base
    const boardGeom = new THREE.BoxGeometry(boardWidth, boardThickness, boardHeight);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xd4a574 });
    const board = new THREE.Mesh(boardGeom, boardMat);
    board.position.set(0, tableTop + boardThickness / 2, 0);
    board.receiveShadow = true;
    scene.scene.add(board);

    // Draw grid lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0x000000 });

    // Vertical lines
    for (let file = 0; file < 9; file++) {
      const x = (file - 4) * fileSize;

      // Bottom half
      let points = [
        new THREE.Vector3(x, tableTop + boardThickness + 0.001, -4 * rankSize),
        new THREE.Vector3(x, tableTop + boardThickness + 0.001, 0),
      ];
      let geom = new THREE.BufferGeometry().setFromPoints(points);
      let line = new THREE.Line(geom, lineMat);
      scene.scene.add(line);

      // Top half
      points = [
        new THREE.Vector3(x, tableTop + boardThickness + 0.001, 0.5 * rankSize),
        new THREE.Vector3(x, tableTop + boardThickness + 0.001, 4.5 * rankSize),
      ];
      geom = new THREE.BufferGeometry().setFromPoints(points);
      line = new THREE.Line(geom, lineMat);
      scene.scene.add(line);
    }

    // Horizontal lines
    for (let rank = 0; rank < 10; rank++) {
      const z = (rank - 4.5) * rankSize;
      const points = [
        new THREE.Vector3(-4 * fileSize, tableTop + boardThickness + 0.001, z),
        new THREE.Vector3(4 * fileSize, tableTop + boardThickness + 0.001, z),
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geom, lineMat);
      scene.scene.add(line);
    }

    // Create pieces
    const pieces: Array<[Color, string, number, number]> = [];

    // Red pieces
    pieces.push(["red", "chariot", 0, 0]);
    pieces.push(["red", "horse", 0, 1]);
    pieces.push(["red", "elephant", 0, 2]);
    pieces.push(["red", "advisor", 0, 3]);
    pieces.push(["red", "general", 0, 4]);
    pieces.push(["red", "advisor", 0, 5]);
    pieces.push(["red", "elephant", 0, 6]);
    pieces.push(["red", "horse", 0, 7]);
    pieces.push(["red", "chariot", 0, 8]);
    pieces.push(["red", "cannon", 2, 1]);
    pieces.push(["red", "cannon", 2, 7]);
    for (let i = 0; i < 5; i++) {
      pieces.push(["red", "soldier", 3, i * 2]);
    }

    // Black pieces
    pieces.push(["black", "chariot", 9, 0]);
    pieces.push(["black", "horse", 9, 1]);
    pieces.push(["black", "elephant", 9, 2]);
    pieces.push(["black", "advisor", 9, 3]);
    pieces.push(["black", "general", 9, 4]);
    pieces.push(["black", "advisor", 9, 5]);
    pieces.push(["black", "elephant", 9, 6]);
    pieces.push(["black", "horse", 9, 7]);
    pieces.push(["black", "chariot", 9, 8]);
    pieces.push(["black", "cannon", 7, 1]);
    pieces.push(["black", "cannon", 7, 7]);
    for (let i = 0; i < 5; i++) {
      pieces.push(["black", "soldier", 6, i * 2]);
    }

    for (const [color, kind, rank, file] of pieces) {
      const key = `${color}-${kind}-${rank}-${file}`;
      const geom = new THREE.CylinderGeometry(0.045, 0.045, 0.08, 32);
      const mat = new THREE.MeshStandardMaterial({ color: color === "red" ? 0xcc3333 : 0x333333 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.userData = { color, kind, rank, file };
      scene.scene.add(mesh);
      meshes.current.set(key, mesh);
    }
  };

  const layoutPieces = (squares: any[][]) => {
    const scene = ts.current;
    if (!scene) return;

    const fileSize = 0.15;
    const rankSize = 0.15;
    const tableTop = scene.tableTop;

    targetPositions.current.clear();

    const seen = new Set<string>();
    for (let rank = 0; rank < 10; rank++) {
      for (let file = 0; file < 9; file++) {
        const piece = squares[rank][file];
        if (!piece) continue;

        const key = `${piece.color}-${piece.kind}-${rank}-${file}`;
        seen.add(key);

        const mesh = meshes.current.get(key) || Array.from(meshes.current.values()).find(
          m => m.userData.color === piece.color &&
               m.userData.kind === piece.kind &&
               !seen.has(`${m.userData.color}-${m.userData.kind}-${m.userData.rank}-${m.userData.file}`)
        );

        if (mesh) {
          mesh.userData.rank = rank;
          mesh.userData.file = file;
          mesh.visible = true;

          const x = (file - 4) * fileSize;
          const z = (rank - 4.5) * rankSize;
          const y = tableTop + 0.04;

          targetPositions.current.set(key, {
            pos: new THREE.Vector3(x, y, z),
            rot: new THREE.Quaternion(),
          });
        }
      }
    }

    for (const [key, mesh] of meshes.current.entries()) {
      if (!seen.has(key)) {
        mesh.visible = false;
      }
    }
  };

  const handlePick = useCallback((id: number) => {
    if (game.status !== "active" || game.board.turn !== humanColor || thinking) return;

    const scene = ts.current;
    if (!scene) return;

    const picked = scene.pickables[id];
    if (!picked) return;

    const rank = picked.userData.rank;
    const file = picked.userData.file;
    const pos: Position = { file, rank };

    if (selectedSquare) {
      const move = legalMoves.find(m => m.to.file === file && m.to.rank === rank);
      if (move) {
        handleMove(move);
      } else {
        selectSquare(pos);
      }
    } else {
      selectSquare(pos);
    }
  }, [game, selectedSquare, legalMoves, humanColor, thinking]);

  const selectSquare = (pos: Position) => {
    const piece = game.board.squares[pos.rank][pos.file];
    if (piece && piece.color === humanColor) {
      setSelectedSquare(pos);
      const moves = generateLegalMoves(game.board).filter(
        m => m.from.file === pos.file && m.from.rank === pos.rank
      );
      setLegalMoves(moves);
    } else {
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  };

  const handleMove = async (move: Move) => {
    setSelectedSquare(null);
    setLegalMoves([]);

    const newGame = { ...game, board: { ...game.board }, moves: [...game.moves] };
    applyMove(newGame, move);
    setGame(newGame);
    layoutPieces(newGame.board.squares);

    addLog(`${lt(("color." + humanColor) as any)} ${posToString(move.from)}-${posToString(move.to)}`);

    if (brainsRef.current) {
      const code = codeOf(moveToString(move));
      await brainTeach(brainsRef.current, humanSeat, [code], 1);
    }

    if (newGame.status !== "active") {
      if (newGame.status === "checkmate") {
        addLog(lt(("msg." + (newGame.winner === "red" ? "redWins" : "blackWins")) as any));
      } else {
        addLog(lt("status.stalemate"));
      }
      return;
    }

    setThinking(true);
    setTimeout(() => botMove(newGame), 500);
  };

  const botMove = async (currentGame: GameState) => {
    const botColor: Color = humanColor === "red" ? "black" : "red";
    const botSeat = humanColor === "red" ? 2 : 0;

    const candidates = getBestMoves(currentGame.board, 3, 3);
    if (candidates.length === 0) {
      setThinking(false);
      return;
    }

    let chosenMove = candidates[0].move;

    if (brainsRef.current) {
      const cands: Candidate<Move>[] = candidates.map(c => ({
        item: c.move,
        code: codeOf(moveToString(c.move)),
      }));

      const result = await brainChoose(brainsRef.current, botSeat, cands, "like");
      if (result) {
        chosenMove = result.item;
      }
    }

    const newGame = { ...currentGame, board: { ...currentGame.board }, moves: [...currentGame.moves] };
    applyMove(newGame, chosenMove);
    setGame(newGame);
    layoutPieces(newGame.board.squares);

    addLog(`${lt(("color." + botColor) as any)} ${posToString(chosenMove.from)}-${posToString(chosenMove.to)}`);

    if (newGame.status !== "active") {
      if (newGame.status === "checkmate") {
        addLog(lt(("msg." + (newGame.winner === "red" ? "redWins" : "blackWins")) as any));
      } else {
        addLog(lt("status.stalemate"));
      }
    }

    setThinking(false);
  };

  const addLog = (msg: string) => {
    setLog(prev => [...prev, msg].slice(-10));
  };

  const handleNewGame = () => {
    const newGame = createGame();
    setGame(newGame);
    setSelectedSquare(null);
    setLegalMoves([]);
    setLog([]);
    setThinking(false);
    layoutPieces(newGame.board.squares);
  };

  const handleBrainsApi = (api: BrainsApi | null) => {
    brainsRef.current = api;
  };

  const brainNames = [
    lt("color.red"),
    "",
    lt("color.black"),
    "",
  ];

  const statusText = game.status === "active"
    ? game.board.turn === humanColor
      ? lt("msg.yourTurn")
      : lt("action.thinking")
    : game.status === "checkmate"
    ? lt(("msg." + (game.winner === "red" ? "redWins" : "blackWins")) as any)
    : lt(("status." + game.status) as any);

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
          {isInCheck(game.board, game.board.turn) && game.status === "active" && (
            <div className="text-red-600 text-sm">{lt("msg.check")}</div>
          )}
        </div>
      </div>

      {log.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-64 bg-white/90 rounded-lg shadow-lg p-3 max-h-40 overflow-y-auto pointer-events-none">
          {log.map((msg, i) => (
            <div key={i} className="text-sm py-0.5">{msg}</div>
          ))}
        </div>
      )}

      {wide ? (
        <FlyBrains
          names={brainNames}
          labelOf={(seat) => brainNames[seat]}
          active={game.status === "active" ? (game.board.turn === humanColor ? humanSeat : (humanSeat + 2) % 4) : null}
          enabled={true}
          onApi={handleBrainsApi}
          variant="overlay"
          seats={TABLE_SEATS.filter(s => s.seat === 0 || s.seat === 2)}
        />
      ) : (
        <div className="bg-white border-t border-gray-200">
          <FlyBrains
            names={brainNames}
            labelOf={(seat) => brainNames[seat]}
            active={game.status === "active" ? (game.board.turn === humanColor ? humanSeat : (humanSeat + 2) % 4) : null}
            enabled={true}
            onApi={handleBrainsApi}
            variant="strip"
            seats={TABLE_SEATS.filter(s => s.seat === 0 || s.seat === 2)}
          />
        </div>
      )}
    </div>
  );
}
