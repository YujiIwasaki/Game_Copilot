(() => {
  "use strict";

  const SIZE_NAMES = ["小", "中", "大"];
  const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  const SYMBOLS = ["×", "○"];
  const boardElement = document.querySelector("#board");
  const cells = [...document.querySelectorAll(".cell")];
  const statusElement = document.querySelector("#game-status");
  const statusText = document.querySelector("#status-text");
  const hintElement = document.querySelector("#board-hint");
  const startButton = document.querySelector("#start-button");
  const restartButton = document.querySelector("#restart-button");
  const setupSelects = [
    document.querySelector("#player1-type"),
    document.querySelector("#player2-type")
  ];

  let state = createInitialState();
  let playerTypes = ["human", "human"];
  let started = false;
  let finished = false;
  let selectedSize = null;
  let winner = null;
  let winningLine = [];
  let aiTimer = null;
  let searchVersion = 0;

  function createInitialState() {
    return {
      board: Array(9).fill(0),
      stacks: Array(9).fill(0),
      remaining: [[2, 2, 2], [2, 2, 2]],
      turn: 0,
      moves: 0
    };
  }

  function pieceOwner(piece) {
    return Math.floor((piece - 1) / 3);
  }

  function pieceSize(piece) {
    return ((piece - 1) % 3) + 1;
  }

  function pieceCode(player, size) {
    return player * 3 + size;
  }

  function getWinningLine(board, player) {
    return WIN_LINES.find(line => line.every(index =>
      board[index] !== 0 && pieceOwner(board[index]) === player
    )) || null;
  }

  function legalMoves(position, player) {
    const moves = [];
    for (let cell = 0; cell < 9; cell += 1) {
      const top = position.board[cell];
      const topSize = top === 0 ? 0 : pieceSize(top);
      for (let size = 1; size <= 3; size += 1) {
        if (position.remaining[player][size - 1] > 0 && size > topSize) {
          moves.push({ cell, size });
        }
      }
    }
    return moves;
  }

  function applyMove(position, player, move) {
    const next = {
      board: position.board.slice(),
      stacks: position.stacks.slice(),
      remaining: position.remaining.map(counts => counts.slice()),
      turn: 1 - player,
      moves: position.moves + 1
    };
    next.board[move.cell] = pieceCode(player, move.size);
    next.stacks[move.cell] += 1;
    next.remaining[player][move.size - 1] -= 1;
    return next;
  }

  function searchKey(position, player) {
    return `${position.board.join("")}|${position.remaining[0].join("")}${position.remaining[1].join("")}|${player}`;
  }

  function solveMove(position, player) {
    const memo = new Map();
    let nodes = 0;

    function search(current, side, alpha, beta, depth) {
      nodes += 1;
      const key = searchKey(current, side);
      const cached = memo.get(key);
      if (cached) {
        if (cached.bound === "exact") return cached.score;
        if (cached.bound === "lower") alpha = Math.max(alpha, cached.score);
        if (cached.bound === "upper") beta = Math.min(beta, cached.score);
        if (alpha >= beta) return cached.score;
      }
      const alphaOriginal = alpha;
      const betaOriginal = beta;

      const moves = legalMoves(current, side);
      if (moves.length === 0 || current.board.every(piece => piece !== 0)) return 0;

      let best = -Infinity;
      const ordered = moves.map(move => {
        const next = applyMove(current, side, move);
        const win = getWinningLine(next.board, side) !== null;
        return { move, next, win };
      }).sort((a, b) => Number(b.win) - Number(a.win));

      for (const option of ordered) {
        let score;
        if (option.win) {
          score = 100 - depth;
        } else if (option.next.board.every(piece => piece !== 0) || legalMoves(option.next, 1 - side).length === 0) {
          score = 0;
        } else {
          score = -search(option.next, 1 - side, -beta, -alpha, depth + 1);
        }

        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }

      const bound = best <= alphaOriginal ? "upper" : best >= betaOriginal ? "lower" : "exact";
      memo.set(key, { score: best, bound });
      return best;
    }

    const moves = legalMoves(position, player);
    let bestMove = null;
    let bestScore = -Infinity;
    let alpha = -Infinity;
    const ordered = moves.map(move => {
      const next = applyMove(position, player, move);
      return { move, next, win: getWinningLine(next.board, player) !== null };
    }).sort((a, b) => Number(b.win) - Number(a.win));

    for (const option of ordered) {
      const score = option.win
        ? 100
        : option.next.board.every(piece => piece !== 0) || legalMoves(option.next, 1 - player).length === 0
          ? 0
          : -search(option.next, 1 - player, -Infinity, -alpha, 1);
      if (score > bestScore) {
        bestScore = score;
        bestMove = option.move;
      }
      if (bestScore > alpha) alpha = bestScore;
    }
    return { move: bestMove, score: bestScore, nodes };
  }

  function render() {
    const humanTurn = started && !finished && playerTypes[state.turn] === "human";
    const currentCanPlay = humanTurn && selectedSize !== null &&
      state.remaining[state.turn][selectedSize - 1] > 0;

    cells.forEach((cell, index) => {
      const piece = state.board[index];
      cell.replaceChildren();
      cell.classList.toggle("is-winning", winningLine.includes(index));
      const topSize = piece === 0 ? 0 : pieceSize(piece);
      const legal = currentCanPlay && selectedSize > topSize;
      cell.classList.toggle("is-legal", legal);
      cell.disabled = !legal;
      cell.setAttribute("aria-label", `${Math.floor(index / 3) + 1}行${index % 3 + 1}列、${piece === 0 ? "空き" : `${pieceOwner(piece) === 0 ? "先攻" : "後攻"}の${SIZE_NAMES[topSize - 1]}の駒`}${state.stacks[index] > 1 ? `、${state.stacks[index]}個の駒が重なっています` : ""}`);
      if (piece !== 0) {
        const token = document.createElement("span");
        token.className = `piece-token size-${topSize} owner-${pieceOwner(piece)}`;
        token.textContent = SYMBOLS[pieceOwner(piece)];
        token.setAttribute("aria-hidden", "true");
        cell.append(token);
        if (state.stacks[index] > 1) {
          const count = document.createElement("span");
          count.className = "stack-count";
          count.textContent = `+${state.stacks[index] - 1}`;
          count.setAttribute("aria-hidden", "true");
          cell.append(count);
        }
      }
    });

    for (let player = 0; player < 2; player += 1) {
      const card = document.querySelector(`#player-card-${player}`);
      const tray = document.querySelector(`#piece-tray-${player}`);
      const kind = document.querySelector(`#player-${player === 0 ? "one" : "two"}-kind`);
      const indicator = document.querySelector(`#turn-indicator-${player}`);
      card.classList.toggle("is-active", started && !finished && state.turn === player);
      indicator.textContent = started && !finished && state.turn === player ? "YOUR TURN" : "PLAYER";
      kind.textContent = playerTypes[player] === "computer" ? "コンピューター" : playerTypes[player] === "human" && started ? "プレイヤー" : "未設定";
      tray.replaceChildren();
      SIZE_NAMES.forEach((name, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `piece-choice size-${index + 1}${selectedSize === index + 1 && state.turn === player ? " is-selected" : ""}${state.remaining[player][index] === 0 ? " count-zero" : ""}`;
        button.disabled = !humanTurn || player !== state.turn || state.remaining[player][index] === 0;
        button.setAttribute("aria-label", `${player === 0 ? "先攻" : "後攻"}の${name}の駒、のこり${state.remaining[player][index]}個`);
        button.setAttribute("aria-pressed", String(selectedSize === index + 1 && state.turn === player));
        const swatch = document.createElement("span");
        swatch.className = "piece-swatch";
        swatch.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = `${name} ${state.remaining[player][index]}`;
        button.append(swatch, label);
        button.addEventListener("click", () => selectPiece(index + 1));
        tray.append(button);
      });
    }

    if (!started) {
      setStatus("プレイヤーを選んで、対戦をはじめましょう。", "idle");
      hintElement.textContent = "まず下の駒を選び、置きたいマスをタップ。";
    } else if (finished && winner !== null) {
      setStatus(`${winner === 0 ? "先攻 ×" : "後攻 ○"}の勝利！見事な一手です。`, "won");
      hintElement.textContent = `三つ並んだマスが勝利ラインです。対局数 ${state.moves} 手。`;
    } else if (finished) {
      const fullBoard = state.board.every(piece => piece !== 0);
      setStatus(fullBoard ? "引き分け！最後まで見ごたえのある対局でした。" : "引き分け！置ける駒がなくなりました。", "draw");
      hintElement.textContent = `${fullBoard ? "9マスがすべて埋まりました。" : "どちらにも合法な手がありません。"} 対局数 ${state.moves} 手。`;
    } else if (playerTypes[state.turn] === "computer") {
      setStatus(`${state.turn === 0 ? "先攻 ×" : "後攻 ○"}のコンピューターが考えています…`, "active");
      hintElement.textContent = "盤面を読み、いちばん有利な一手を探しています。";
    } else if (selectedSize === null) {
      setStatus(`${state.turn === 0 ? "先攻 ×" : "後攻 ○"}の番です。使う駒を選んでください。`, "active");
      hintElement.textContent = "大きな駒は小さな駒の上に置いて、マスを奪えます。";
    } else {
      setStatus(`${state.turn === 0 ? "先攻 ×" : "後攻 ○"}の番 — ${SIZE_NAMES[selectedSize - 1]}の駒を置きます。`, "active");
      hintElement.textContent = "光っているマスに置けます。相手より大きな駒で上書きも可能。";
    }

    statusElement.dataset.state = !started ? "idle" : finished ? (winner === null ? "draw" : "won") : "active";
    startButton.disabled = started && !finished;
    restartButton.disabled = !started;
    setupSelects.forEach(select => { select.disabled = started && !finished; });
  }

  function setStatus(message, stateName) {
    statusText.textContent = message;
    statusElement.dataset.state = stateName;
  }

  function selectPiece(size) {
    if (!started || finished || playerTypes[state.turn] !== "human" || state.remaining[state.turn][size - 1] === 0) return;
    selectedSize = selectedSize === size ? null : size;
    render();
  }

  function playMove(player, move) {
    state = applyMove(state, player, move);
    selectedSize = null;
    const line = getWinningLine(state.board, player);
    if (line) {
      finished = true;
      winner = player;
      winningLine = line;
    } else if (state.board.every(piece => piece !== 0) || legalMoves(state, state.turn).length === 0) {
      finished = true;
    }
    render();
    if (started && !finished && playerTypes[state.turn] === "computer") scheduleComputerMove();
  }

  function scheduleComputerMove() {
    clearTimeout(aiTimer);
    const version = searchVersion;
    aiTimer = window.setTimeout(() => {
      if (version !== searchVersion || !started || finished || playerTypes[state.turn] !== "computer") return;
      const result = solveMove(state, state.turn);
      if (version === searchVersion && result.move) playMove(state.turn, result.move);
    }, 320);
  }

  cells.forEach(cell => {
    cell.addEventListener("click", () => {
      const cellIndex = Number(cell.dataset.cell);
      if (!started || finished || playerTypes[state.turn] !== "human" || selectedSize === null) return;
      const top = state.board[cellIndex] === 0 ? 0 : pieceSize(state.board[cellIndex]);
      if (selectedSize <= top || state.remaining[state.turn][selectedSize - 1] === 0) return;
      playMove(state.turn, { cell: cellIndex, size: selectedSize });
    });
  });

  startButton.addEventListener("click", () => {
    if (started && !finished) return;
    clearTimeout(aiTimer);
    searchVersion += 1;
    playerTypes = setupSelects.map(select => select.value);
    state = createInitialState();
    started = true;
    finished = false;
    winner = null;
    winningLine = [];
    selectedSize = null;
    render();
    if (playerTypes[0] === "computer") scheduleComputerMove();
  });

  restartButton.addEventListener("click", () => {
    if (!started) return;
    clearTimeout(aiTimer);
    searchVersion += 1;
    state = createInitialState();
    finished = false;
    winner = null;
    winningLine = [];
    selectedSize = null;
    render();
    if (playerTypes[0] === "computer") scheduleComputerMove();
  });

  render();
})();
