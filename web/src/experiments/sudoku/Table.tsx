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
  setCell,
  type GameState,
  type Board,
} from "./engine";
import { getBestMoves, type ScoredMove } from "./bot";

/**
 * Sudoku table
 */
export function SudokuTable() {
  const { t, lang } = useT();
  const { lt } = useLocalT(dict);
  const wide = useMedia("(min-width: 1024px)");
  const bodyKind = useBodyKind();

  const containerRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<GameState>(() => createGame("medium"));
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const brainsRef = useRef<BrainsApi | null>(null);

  const ts = useRef<TableScene | null>(null);
  const cellMeshes = useRef<THREE.Mesh[][]>([]);
  const numberMeshes = useRef<THREE.Group[][]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new TableScene(containerRef.current, {
      body: bodyKind,
      set: "tea",
      mat: { shape: "square", size: 1.0, texture: "cloth", color: 0xf5f5dc },
      presets: {
        main: { pos: [0, 0.5, 1.0], look: [0, 0, 0], fov: 45 },
      },
      view: "main",
      seated: [0],
    });

    ts.current = scene;
    createBoardMeshes(scene);
    updateBoard(game.current);

    scene.pickables = cellMeshes.current.flat();
    scene.onPick = handlePick;

    return () => {
      scene.dispose();
      ts.current = null;
    };
  }, [bodyKind]);

  useEffect(() => {
    if (ts.current) {
      updateBoard(game.current);
    }
  }, [game]);

  const createBoardMeshes = (scene: TableScene) => {
    const tableTop = scene.tableTop;
    const cellSize = 0.12;
    const boardSize = cellSize * 9;
    const boardThickness = 0.02;

    const boardGeom = new THREE.BoxGeometry(boardSize, boardThickness, boardSize);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc });
    const board = new THREE.Mesh(boardGeom, boardMat);
    board.position.set(0, tableTop + boardThickness / 2, 0);
    board.receiveShadow = true;
    scene.scene.add(board);

    const cellMat = new THREE.MeshStandardMaterial({ color: 0xffffff });

    for (let row = 0; row < 9; row++) {
      cellMeshes.current[row] = [];
      numberMeshes.current[row] = [];

      for (let col = 0; col < 9; col++) {
        const geom = new THREE.PlaneGeometry(cellSize * 0.95, cellSize * 0.95);
        const mesh = new THREE.Mesh(geom, cellMat.clone());
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(
          (col - 4) * cellSize,
          tableTop + boardThickness + 0.002,
          (row - 4) * cellSize
        );
        mesh.receiveShadow = true;
        mesh.userData = { row, col };
        scene.scene.add(mesh);
        cellMeshes.current[row][col] = mesh;

        const numGroup = new THREE.Group();
        numGroup.position.set(
          (col - 4) * cellSize,
          tableTop + boardThickness + 0.04,
          (row - 4) * cellSize
        );
        scene.scene.add(numGroup);
        numberMeshes.current[row][col] = numGroup;
      }
    }

    const lineMat = new THREE.LineBasicMaterial({ color: 0x666666 });
    const thickLineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

    for (let i = 0; i <= 9; i++) {
      const x = (i - 4.5) * cellSize;
      const points = [
        new THREE.Vector3(x, tableTop + boardThickness + 0.003, -boardSize / 2),
        new THREE.Vector3(x, tableTop + boardThickness + 0.003, boardSize / 2),
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = i % 3 === 0 ? thickLineMat : lineMat;
      const line = new THREE.Line(geom, mat);
      scene.scene.add(line);
    }

    for (let i = 0; i <= 9; i++) {
      const z = (i - 4.5) * cellSize;
      const points = [
        new THREE.Vector3(-boardSize / 2, tableTop + boardThickness + 0.003, z),
        new THREE.Vector3(boardSize / 2, tableTop + boardThickness + 0.003, z),
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = i % 3 === 0 ? thickLineMat : lineMat;
      const line = new THREE.Line(geom, mat);
      scene.scene.add(line);
    }
  };

  const updateBoard = (board: Board) => {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const num = board[row][col];
        const group = numberMeshes.current[row][col];

        while (group.children.length > 0) {
          group.remove(group.children[0]);
        }

        if (num !== 0) {
          const isInitial = game.initial[row][col] !== 0;
          const geom = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16);
          const mat = new THREE.MeshStandardMaterial({
            color: isInitial ? 0x333333 : 0x0066cc,
          });
          const mesh = new THREE.Mesh(geom, mat);
          mesh.castShadow = true;
          group.add(mesh);
        }

        const cellMesh = cellMeshes.current[row][col];
        if (selected && selected.row === row && selected.col === col) {
          (cellMesh.material as THREE.MeshStandardMaterial).color.setHex(0xaaddff);
        } else {
          (cellMesh.material as THREE.MeshStandardMaterial).color.setHex(0xffffff);
        }
      }
    }
  };

  const handlePick = useCallback((id: number) => {
    if (game.status !== "active" || thinking) return;

    const scene = ts.current;
    if (!scene) return;

    const picked = scene.pickables[id];
    if (!picked) return;

    const row = picked.userData.row;
    const col = picked.userData.col;

    setSelected({ row, col });
  }, [game, thinking]);

  const handleNumberInput = async (num: number) => {
    if (!selected || game.status !== "active" || thinking) return;
    if (game.initial[selected.row][selected.col] !== 0) return;

    const newGame = {
      ...game,
      current: game.current.map(r => [...r]),
    };

    setCell(newGame, selected.row, selected.col, num);
    setGame(newGame);

    if (brainsRef.current) {
      const code = codeOf(`${selected.row}${selected.col}${num}`);
      await brainTeach(brainsRef.current, 0, [code], 1);
    }

    if (newGame.status === "won") {
      setSelected(null);
    }
  };

  const handleClear = () => {
    if (!selected || game.status !== "active") return;
    if (game.initial[selected.row][selected.col] !== 0) return;

    const newGame = {
      ...game,
      current: game.current.map(r => [...r]),
    };

    newGame.current[selected.row][selected.col] = 0;
    setGame(newGame);
  };

  const handleHint = async () => {
    if (game.status !== "active" || thinking) return;

    setThinking(true);

    const candidates = getBestMoves(game.current, 3);
    if (candidates.length === 0) {
      setThinking(false);
      return;
    }

    let chosen = candidates[0];

    if (brainsRef.current) {
      const cands: Candidate<ScoredMove>[] = candidates.map(c => ({
        item: c,
        code: codeOf(`${c.row}${c.col}${c.num}`),
      }));

      const result = await brainChoose(brainsRef.current, 0, cands, "like");
      if (result) {
        chosen = result.item;
      }
    }

    const newGame = {
      ...game,
      current: game.current.map(r => [...r]),
    };

    setCell(newGame, chosen.row, chosen.col, chosen.num);
    setGame(newGame);
    setSelected({ row: chosen.row, col: chosen.col });

    setThinking(false);
  };

  const handleNewGame = () => {
    const newGame = createGame(difficulty);
    setGame(newGame);
    setSelected(null);
    setThinking(false);
  };

  const handleBrainsApi = (api: BrainsApi | null) => {
    brainsRef.current = api;
  };

  const statusText = game.status === "won"
    ? lt("msg.congratulations")
    : lt("status.playing");

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 relative" ref={containerRef} />

      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
        <div className="pointer-events-auto flex gap-2">
          <button
            onClick={handleNewGame}
            className="px-4 py-2 bg-white/90 hover:bg-white rounded-lg shadow-lg"
          >
            {lt("action.newGame")}
          </button>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as any)}
            className="px-4 py-2 bg-white/90 hover:bg-white rounded-lg shadow-lg"
          >
            <option value="easy">{lt("difficulty.easy")}</option>
            <option value="medium">{lt("difficulty.medium")}</option>
            <option value="hard">{lt("difficulty.hard")}</option>
          </select>
          <button
            onClick={handleHint}
            disabled={game.status !== "active" || thinking}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow-lg disabled:opacity-50"
          >
            {lt("action.hint")}
          </button>
        </div>

        <div className="bg-white/90 rounded-lg shadow-lg px-4 py-2">
          <div className="font-medium">{statusText}</div>
        </div>
      </div>

      {selected && game.status === "active" && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-white/90 rounded-lg shadow-lg p-4 pointer-events-auto">
          <div className="grid grid-cols-3 gap-2 mb-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                onClick={() => handleNumberInput(num)}
                className="w-12 h-12 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-lg font-bold"
              >
                {num}
              </button>
            ))}
          </div>
          <button
            onClick={handleClear}
            className="w-full py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg"
          >
            {lt("action.clear")}
          </button>
        </div>
      )}

      {wide ? (
        <FlyBrains
          names={["Sudoku", "", "", ""]}
          labelOf={() => "Sudoku"}
          active={game.status === "active" ? 0 : null}
          enabled={true}
          onApi={handleBrainsApi}
          variant="overlay"
          seats={[TABLE_SEATS[0]]}
        />
      ) : (
        <div className="bg-white border-t border-gray-200">
          <FlyBrains
            names={["Sudoku", "", "", ""]}
            labelOf={() => "Sudoku"}
            active={game.status === "active" ? 0 : null}
            enabled={true}
            onApi={handleBrainsApi}
            variant="strip"
            seats={[TABLE_SEATS[0]]}
          />
        </div>
      )}
    </div>
  );
}
