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
 * Chess table for 2 players
 */
export function ChessTable() {
  const { t, lang } = useT();
  const { lt } = useLocalT(dict);
  const wide = useMedia("(min-width: 1024px)");
  const bodyKind = useBodyKind();

  const containerRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [game, setGame] = useState<GameState>(createGame);
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [thinking, setThinking] = useState(false);
  const [showPromotion, setShowPromotion] = useState<{ move: Move } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const brainsRef = useRef<BrainsApi | null>(null);

  const ts = useRef<TableScene | null>(null);
  const meshes = useRef<Map<string, THREE.Mesh>>(new Map());
  const targetPositions = useRef<Map<string, { pos: THREE.Vector3; rot: THREE.Quaternion }>>(new Map());

  const humanSeat = 0;
  const humanColor: Color = "white";

  // Initialize scene
  useEffect(() => {
    if (!started || !containerRef.current) return;

    const scene = new TableScene(containerRef.current, {
      body: bodyKind,
      set: "tea",
      mat: { shape: "square", size: 1.0, texture: "cloth", color: 0xf0d9b5 },
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
  }, [started, bodyKind]);

  const createBoardMeshes = (scene: TableScene) => {
    const tableTop = scene.tableTop;
    const squareSize = 0.16;
    const boardSize = squareSize * 8;
    const boardThickness = 0.02;

    // Board base
    const boardGeom = new THREE.BoxGeometry(boardSize, boardThickness, boardSize);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x8b7355 });
    const board = new THREE.Mesh(boardGeom, boardMat);
    board.position.set(0, tableTop + boardThickness / 2, 0);
    board.receiveShadow = true;
    scene.scene.add(board);

    // Squares
    const lightSquare = new THREE.MeshStandardMaterial({ color: 0xf0d9b5 });
    const darkSquare = new THREE.MeshStandardMaterial({ color: 0xb58863 });
    const squareGeom = new THREE.PlaneGeometry(squareSize * 0.98, squareSize * 0.98);

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const isLight = (rank + file) % 2 === 0;
        const square = new THREE.Mesh(squareGeom, isLight ? lightSquare : darkSquare);
        square.rotation.x = -Math.PI / 2;
        square.position.set(
          (file - 3.5) * squareSize,
          tableTop + boardThickness + 0.001,
          (rank - 3.5) * squareSize
        );
        square.receiveShadow = true;
        scene.scene.add(square);
      }
    }

    // Create pieces
    const pieces: Array<[Color, string, number, number]> = [];

    for (let i = 0; i < 8; i++) {
      pieces.push(["white", "pawn", 1, i]);
    }
    pieces.push(["white", "rook", 0, 0]);
    pieces.push(["white", "knight", 0, 1]);
    pieces.push(["white", "bishop", 0, 2]);
    pieces.push(["white", "queen", 0, 3]);
    pieces.push(["white", "king", 0, 4]);
    pieces.push(["white", "bishop", 0, 5]);
    pieces.push(["white", "knight", 0, 6]);
    pieces.push(["white", "rook", 0, 7]);

    for (let i = 0; i < 8; i++) {
      pieces.push(["black", "pawn", 6, i]);
    }
    pieces.push(["black", "rook", 7, 0]);
    pieces.push(["black", "knight", 7, 1]);
    pieces.push(["black", "bishop", 7, 2]);
    pieces.push(["black", "queen", 7, 3]);
    pieces.push(["black", "king", 7, 4]);
    pieces.push(["black", "bishop", 7, 5]);
    pieces.push(["black", "knight", 7, 6]);
    pieces.push(["black", "rook", 7, 7]);

    for (const [color, kind, rank, file] of pieces) {
      const key = `${color}-${kind}-${rank}-${file}`;
      const mesh = createPieceMesh(kind, color === "white" ? 0xeeeeee : 0x333333);
      mesh.userData = { color, kind, rank, file };
      scene.scene.add(mesh);
      meshes.current.set(key, mesh);
    }
  };

  const createPieceMesh = (kind: string, color: number): THREE.Mesh => {
    let geom: THREE.BufferGeometry;
    const height = 0.12;

    switch (kind) {
      case "pawn":
        geom = new THREE.CylinderGeometry(0.03, 0.04, height, 16);
        break;
      case "knight":
        geom = new THREE.BoxGeometry(0.06, height, 0.05);
        break;
      case "bishop":
        geom = new THREE.ConeGeometry(0.04, height, 16);
        break;
      case "rook":
        geom = new THREE.CylinderGeometry(0.045, 0.045, height, 16);
        break;
      case "queen":
        geom = new THREE.ConeGeometry(0.05, height * 1.2, 16);
        break;
      case "king":
        geom = new THREE.CylinderGeometry(0.04, 0.05, height * 1.3, 16);
        break;
      default:
        geom = new THREE.SphereGeometry(0.04, 16, 16);
    }

    const mat = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    return mesh;
  };

  const layoutPieces = (squares: any[][]) => {
    const scene = ts.current;
    if (!scene) return;

    const squareSize = 0.16;
    const tableTop = scene.tableTop;

    targetPositions.current.clear();

    const seen = new Set<string>();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
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

          const x = (file - 3.5) * squareSize;
          const z = (rank - 3.5) * squareSize;
          const y = tableTop + 0.06;

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
        if (move.from.rank === (humanColor === "white" ? 6 : 1) && move.to.rank === (humanColor === "white" ? 7 : 0)) {
          const piece = game.board.squares[selectedSquare.rank][selectedSquare.file];
          if (piece?.kind === "pawn") {
            setShowPromotion({ move });
            return;
          }
        }
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

    const piece = game.board.squares[move.from.rank][move.from.file];
    addLog(`${lt(("color." + humanColor) as any)} ${posToString(move.from)}-${posToString(move.to)}`);

    if (brainsRef.current) {
      const code = codeOf(moveToString(move));
      await brainTeach(brainsRef.current, humanSeat, [code], 1);
    }

    if (newGame.status !== "active") {
      if (newGame.status === "checkmate") {
        addLog(lt(("msg." + (newGame.winner === "white" ? "whiteWins" : "blackWins")) as any));
      } else if (newGame.status === "stalemate") {
        addLog(lt("status.stalemate"));
      } else {
        addLog(lt("status.draw"));
      }
      return;
    }

    setThinking(true);
    setTimeout(() => botMove(newGame), 500);
  };

  const botMove = async (currentGame: GameState) => {
    const botColor: Color = humanColor === "white" ? "black" : "white";
    const botSeat = humanColor === "white" ? 2 : 0;

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
        addLog(lt(("msg." + (newGame.winner === "white" ? "whiteWins" : "blackWins")) as any));
      } else if (newGame.status === "stalemate") {
        addLog(lt("status.stalemate"));
      } else {
        addLog(lt("status.draw"));
      }
    }

    setThinking(false);
  };

  const handlePromotion = (kind: "queen" | "rook" | "bishop" | "knight") => {
    if (!showPromotion) return;
    const move = { ...showPromotion.move, promotion: kind };
    setShowPromotion(null);
    handleMove(move);
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
    lt("color.white"),
    "",
    lt("color.black"),
    "",
  ];

  const statusText = game.status === "active"
    ? game.board.turn === humanColor
      ? lt("msg.yourTurn")
      : lt("action.thinking")
    : game.status === "checkmate"
    ? lt(("msg." + (game.winner === "white" ? "whiteWins" : "blackWins")) as any)
    : lt(("status." + game.status) as any);

  if (!started) {
    return (
      <div className="glass p-10 text-center">
        <h3 className="t-title">{lt("lobby.title")}</h3>
        <p className="t-body mx-auto mt-3 max-w-md">{lt("lobby.body")}</p>
        <button onClick={() => setStarted(true)} className="btn-primary mt-6">{lt("lobby.start")}</button>
      </div>
    );
  }

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

      {showPromotion && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-auto">
          <div className="bg-white rounded-lg shadow-xl p-6">
            <div className="text-lg font-medium mb-4">{lt("promo.title")}</div>
            <div className="flex gap-3">
              {(["queen", "rook", "bishop", "knight"] as const).map(kind => (
                <button
                  key={kind}
                  onClick={() => handlePromotion(kind)}
                  className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
                >
                  {lt(("piece." + kind) as any)}
                </button>
              ))}
            </div>
          </div>
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
