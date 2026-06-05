"use strict";

/** Nomi in italiano da codice a 3 cifre: 1a=VALORE, 2a=FORMA, 3a=COLORE (cifre 1–8). */
(function () {
  const VALUES = ["Asso", "Due", "Tre", "Quattro", "Cinque", "Sei", "Sette", "Otto"];
  const SHAPES = ["Cerchi", "Cuori", "Triangoli", "Quadrati", "Stelle", "Esagoni", "Lampi", "Croci"];
  const COLORS = ["Rosso", "Arancio", "Giallo", "Verde", "Azzurro", "Blu", "Viola", "Bianco"];

  const FEMININE_SHAPES = new Set(["Stelle", "Croci"]);

  const COLOR_FORMS = {
    Bianco: { m: "Bianco", f: "Bianca", mp: "Bianchi", fp: "Bianche" },
    Viola: { fixed: "Viola" },
    Blu: { fixed: "Blu" },
    Azzurro: { m: "Azzurro", f: "Azzurra", mp: "Azzurri", fp: "Azzurre" },
    Verde: { fixed: "Verde", plural: "Verdi" },
    Giallo: { m: "Giallo", f: "Gialla", mp: "Gialli", fp: "Gialle" },
    Arancio: { fixed: "Arancio" },
    Rosso: { m: "Rosso", f: "Rossa", mp: "Rossi", fp: "Rosse" }
  };

  function parseIndices(code) {
    const text = String(code).padStart(3, "0");
    const value = Number(text[0]);
    const shape = Number(text[1]);
    const color = Number(text[2]);
    if (
      value < 1 || value > 8 ||
      shape < 1 || shape > 8 ||
      color < 1 || color > 8
    ) {
      throw new Error("Codice carta non valido: " + code);
    }
    return { value, shape, color };
  }

  function colorLabel(colorName, value, shapeName) {
    const forms = COLOR_FORMS[colorName];
    if (!forms) return colorName;
    if (forms.fixed) {
      return value > 1 && forms.plural ? forms.plural : forms.fixed;
    }
    const feminine = FEMININE_SHAPES.has(shapeName);
    if (value > 1) {
      return feminine ? forms.fp : forms.mp;
    }
    return feminine ? forms.f : forms.m;
  }

  function formatCardName(codeOrCard) {
    const code = typeof codeOrCard === "object" && codeOrCard
      ? codeOrCard.code
      : codeOrCard;
    const { value, shape, color } = parseIndices(code);
    const valueName = VALUES[value - 1];
    const shapeName = SHAPES[shape - 1];
    const colorName = COLORS[color - 1];
    const colorWord = colorLabel(colorName, value, shapeName);
    return `${valueName} di ${shapeName} ${colorWord}`;
  }

  globalThis.MPCardsNames = {
    VALUES,
    SHAPES,
    COLORS,
    FEMININE_SHAPES,
    formatCardName,
    colorLabel
  };
})();