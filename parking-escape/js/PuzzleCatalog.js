(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.ParkingPuzzleCatalog = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SIZE = 6;
  const EXIT_ROW = 3;
  const EXIT_SIDE = "left";

  // Michael Fogleman's Rush Hour database stores boards with the primary car
  // exiting to the right from zero-based row 2. Reversing the row-major board
  // string rotates it 180 degrees, which puts the exit on our left at row 3.
  // For each exact move count, the no-wall board with the smallest reachable
  // state cluster was selected so catalog verification stays inexpensive.
  const SOURCE_LEVELS = Object.freeze([
    ["ooBoooooBoooAABooooooooooooooooooooo", 14],
    ["BBBoooooCoooAACoooooDoooooDoooooDooo", 20],
    ["ooEBBBooEooFooEAAFoCCCDDoooooooooooo", 12],
    ["oBBBCCooFoDDooFAAHooFooHooGEEEooGooo", 11],
    ["FBBBCCFoHooKGoHAAKGoIDDDooIJooEEEJoo", 7],
    ["FBBBCCFoHooKFoHAAKGoIDDDGoIoJoEEEoJo", 8],
    ["GBBBCCGoIooKGoIAAKHoJDDDHoJoooEEEFFo", 9],
    ["IBBBCCIDDEEMJAAooMJoKFFFGGKLooHHHLoo", 11],
    ["HBBBCCHDDooMHoJAAMIoJLEEIoKLooFFKGGG", 14],
    ["BBGooKoEGoIKoEAAIKoEHCCCoFHoJooFDDJo", 18],
    ["oBBCCMoIDDKMoIAAKMoIJEEEFFJoLoGGHHLo", 17],
    ["FBBCCKFHooJKGHAAJLGHDDDLEEEIoLoooIoo", 25],
    ["IBBCCNIJDDLNIJAALNoJKEEEFFKoMoGGHHMo", 22],
    ["GoJBBBGIJoKLGIAAKLHICCDDHooooMEEEFFM", 21],
    ["HoKBBBHJKoLMHJAALMIJCCDDIoEEENFFFGGN", 34],
    ["BBJCCMGoJKLMGAAKLMHIoDDDHIooooHEEEFF", 40],
    ["oEBBBJoECCIJAAGoIKoFGoIKoFHooKoFHDDD", 33],
    ["oEBBBKoECCJKAAGIJLoFGIJLoFHooLoFHDDD", 56],
    ["HBBBCCHoJKooAAJKoMIDDEEMIooLooFFFLGG", 40],
    ["HBBCCLHoJooLIoJAALIDDKEEIooKooFFGGGo", 41],
    ["HoBBCCHoJoKLAAJoKLIDDEEMIooooMFFFGGM", 36],
    ["FoHBBBFoHIoKGAAIoKGCCJoLoooJoLDDEEEL", 50],
    ["GoIBBBGoIJKLHAAJKLHCCDDMoooooMEEEFFM", 67],
    ["HoBBCCHoJooLIoJAALIDDEELIooKooFFFKGG", 50],
    ["HoBBCCHoJooMHoJAAMIoKDDMIoKLEEFFFLGG", 67],
    ["FoGIBBFoGIKLFoAAKLCCHDDLooHJooEEEJoo", 94],
    ["BBBCCMHDDKoMHAAKoMHoJLEEIoJLooIFFGGo", 81],
    ["BBCCLMGooKLMGAAKoNGIJDDNHIJoooHEEFFF", 199],
    ["BBBoIJooGoIJAAGooKoFCCoKoFHooKDDHEEE", 162],
    ["IKBBCCIKDDMoIKAAMoJEELMoJooLFFGGHHoo", 252],
    ["BBCCoMHooKoMHAAKoMIoJLDDIoJLEEIFFFGG", 81],
    ["FBBBJLFoIoJLAAIoKMoHCCKMGHoooMGDDDEE", 212],
    ["BBICCCooIooKHoIAAKHDDEEKoooJFFGGGJoo", 241],
    ["ooHBBKGoHJoKGAAJoLGCCDDLEEIooLooIFFF", 175],
    ["BBBCCLHDDooLHAAooLHoJEEEIoJKFFIGGKoo", 446],
    ["FoIBBBFoIJoKGAAJoKGCCDDKGHEEoooHoooo", 483],
    ["ooFBBIooFGoIAAFGoIECCCooEDDHoooooHoo", 674],
    ["ooHBBoCCHIKoGAAIKoGDDEEoFFFJoooooJoo", 538],
    ["BBCCCLGoHooLGoHAALDDEEKoooIJKoooIJFF", 919],
    ["BBHCCoGoHoJoGAAoJoGDDDJooooIooEEoIFF", 594],
    ["BBICCoHoIoKoHAAoKoHDDDKooooJEEFFoJGG", 1090],
    ["BBHCCCooHooJAAHooJGDDEEJGFFIoooooIoo", 503],
    ["BBBCCLHooooLHAAooLHIDDEEoIJKFFGGJKoo", 737],
    ["FBBIJKFoGIJKAAGIoLCCDDoLooHoooooHEEE", 1168],
    ["EGBBKLEGHoKLFoHAAMFCCJoMFoIJoMooIDDD", 1171],
    ["ooGBBBooGIooAAHIoJCCHDDJoFEEoJoFoooo", 1045],
    ["ooHBBBooHJooAAIJoKCCIDDKFGEEoKFGoooo", 2295],
    ["ooHBBBooHJooAAIJoKCCIDDKoGEEoKoGFFoo", 2295],
    ["ooIBBBooIKooAAJKoLCCJDDLGHEEoLGHFFoo", 4643],
    ["GBBoLoGHIoLMGHIAAMCCCKoMooJKDDEEJFFo", 4780],
  ].map(Object.freeze));

  const MAX_LEVEL = SOURCE_LEVELS.length;
  const LEVEL_COUNT = MAX_LEVEL;

  function assertSourceBoard(board) {
    if (typeof board !== "string" || board.length !== SIZE * SIZE) {
      throw new TypeError(`Rush Hour board must be a ${SIZE * SIZE}-character string.`);
    }
    if (!/^[A-Z.ox]+$/.test(board)) {
      throw new TypeError("Rush Hour board contains an unsupported cell character.");
    }
    if (board.includes("x")) {
      throw new TypeError("Wall cells are not supported by Parking Escape.");
    }
  }

  function rotateBoard180(board) {
    assertSourceBoard(board);
    return Array.from(board).reverse().join("");
  }

  function parseRotatedBoard(board) {
    const cellsByLabel = new Map();
    for (let index = 0; index < board.length; index += 1) {
      const label = board[index];
      if (label === "o" || label === ".") continue;
      const cells = cellsByLabel.get(label) || [];
      cells.push({ x: index % SIZE, y: Math.floor(index / SIZE) });
      cellsByLabel.set(label, cells);
    }

    if (!cellsByLabel.has("A")) {
      throw new TypeError("Rush Hour board is missing primary vehicle A.");
    }

    return Array.from(cellsByLabel.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, cells]) => {
        if (cells.length !== 2 && cells.length !== 3) {
          throw new TypeError(`Vehicle ${label} must occupy two or three cells.`);
        }

        const xs = cells.map(cell => cell.x);
        const ys = cells.map(cell => cell.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const horizontal = minY === maxY;
        const vertical = minX === maxX;
        if (horizontal === vertical) {
          throw new TypeError(`Vehicle ${label} is not a straight piece.`);
        }

        const span = horizontal ? maxX - minX + 1 : maxY - minY + 1;
        if (span !== cells.length) {
          throw new TypeError(`Vehicle ${label} contains a gap.`);
        }

        const target = label === "A";
        if (target && (!horizontal || cells.length !== 2 || minY !== EXIT_ROW)) {
          throw new TypeError("Primary vehicle A is not aligned with the Parking Escape exit.");
        }

        return {
          id: target ? "goal" : `rush-${label.toLowerCase()}`,
          target,
          axis: horizontal ? "H" : "V",
          x: minX,
          y: minY,
          w: horizontal ? cells.length : 1,
          h: vertical ? cells.length : 1,
          colorIndex: target ? 0 : ((label.charCodeAt(0) - 66) % 7) + 1,
        };
      });
  }

  function parseBoard(sourceBoard) {
    const board = rotateBoard180(sourceBoard);
    return {
      sourceBoard,
      board,
      size: SIZE,
      exitRow: EXIT_ROW,
      exitSide: EXIT_SIDE,
      vehicles: parseRotatedBoard(board),
    };
  }

  function getLevel(level) {
    const normalized = Number(level);
    if (!Number.isInteger(normalized) || normalized < 1 || normalized > MAX_LEVEL) return null;
    const [sourceBoard, clusterSize] = SOURCE_LEVELS[normalized - 1];
    const parsed = parseBoard(sourceBoard);
    const parMoves = normalized + 1;
    return {
      level: normalized,
      parMoves,
      clusterSize,
      ...parsed,
      metrics: {
        depth: parMoves,
        states: clusterSize,
        vehicles: parsed.vehicles.length,
      },
    };
  }

  function getVehicles(level) {
    const entry = getLevel(level);
    return entry ? entry.vehicles : null;
  }

  return Object.freeze({
    SIZE,
    EXIT_ROW,
    EXIT_SIDE,
    MAX_LEVEL,
    LEVEL_COUNT,
    getLevel,
    getVehicles,
    parseBoard,
    rotateBoard180,
  });
});
