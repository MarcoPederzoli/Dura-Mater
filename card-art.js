"use strict";

/** Mappatura da Carte.xlsx: colonna A = file in grafica/, colonna B = codice carta. */
(function () {
  const IMAGE_BY_CODE = new Map([
    ["118", "grafica/01.jpg"],
    ["227", "grafica/02.jpg"],
    ["238", "grafica/03.jpg"],
    ["247", "grafica/04.jpg"],
    ["328", "grafica/05.jpg"],
    ["336", "grafica/06.jpg"],
    ["348", "grafica/07.jpg"],
    ["356", "grafica/08.jpg"],
    ["367", "grafica/09.jpg"],
    ["428", "grafica/10.jpg"],
    ["437", "grafica/11.jpg"],
    ["445", "grafica/12.jpg"],
    ["456", "grafica/13.jpg"],
    ["467", "grafica/14.jpg"],
    ["478", "grafica/15.jpg"],
    ["486", "grafica/16.jpg"],
    ["538", "grafica/17.jpg"],
    ["548", "grafica/18.jpg"],
    ["554", "grafica/19.jpg"],
    ["564", "grafica/20.jpg"],
    ["575", "grafica/21.jpg"],
    ["577", "grafica/22.jpg"],
    ["588", "grafica/23.jpg"],
    ["586", "grafica/24.jpg"],
    ["587", "grafica/25.jpg"],
    ["637", "grafica/26.jpg"],
    ["646", "grafica/27.jpg"],
    ["655", "grafica/28.jpg"],
    ["666", "grafica/29.jpg"],
    ["663", "grafica/30.jpg"],
    ["675", "grafica/31.jpg"],
    ["678", "grafica/32.jpg"],
    ["674", "grafica/33.jpg"],
    ["688", "grafica/34.jpg"],
    ["687", "grafica/35.jpg"],
    ["684", "grafica/36.jpg"],
    ["747", "grafica/37.jpg"],
    ["757", "grafica/38.jpg"],
    ["758", "grafica/39.jpg"],
    ["768", "grafica/40.jpg"],
    ["766", "grafica/41.jpg"],
    ["765", "grafica/42.jpg"],
    ["776", "grafica/43.jpg"],
    ["772", "grafica/44.jpg"],
    ["773", "grafica/45.jpg"],
    ["782", "grafica/46.jpg"],
    ["784", "grafica/47.jpg"],
    ["785", "grafica/48.jpg"],
    ["783", "grafica/49.jpg"],
    ["846", "grafica/50.jpg"],
    ["858", "grafica/51.jpg"],
    ["857", "grafica/52.jpg"],
    ["856", "grafica/53.jpg"],
    ["868", "grafica/54.jpg"],
    ["865", "grafica/55.jpg"],
    ["864", "grafica/56.jpg"],
    ["875", "grafica/57.jpg"],
    ["874", "grafica/58.jpg"],
    ["873", "grafica/59.jpg"],
    ["877", "grafica/60.jpg"],
    ["883", "grafica/61.jpg"],
    ["885", "grafica/62.jpg"],
    ["882", "grafica/63.jpg"],
    ["881", "grafica/64.jpg"]
  ]);

  const CODES = [
    118, 227, 238, 247, 328, 336, 348, 356, 367, 428, 437, 445, 456, 467, 478, 486,
    538, 548, 554, 564, 575, 577, 588, 586, 587, 637, 646, 655, 666, 663, 675, 678,
    674, 688, 687, 684, 747, 757, 758, 768, 766, 765, 776, 772, 773, 782, 784, 785,
    783, 846, 858, 857, 856, 868, 865, 864, 875, 874, 873, 877, 883, 885, 882, 881
  ];

  globalThis.MPCardsArt = {
    dir: "grafica",
    back: "grafica/Back.jpg",
    codes: CODES.map(code => String(code).padStart(3, "0")),
    imageForCode(code) {
      return IMAGE_BY_CODE.get(String(code).padStart(3, "0")) || null;
    },
    codeForImage(imageName) {
      const key = String(imageName).replace(/\.jpg$/i, "").padStart(2, "0");
      for (const [code, file] of IMAGE_BY_CODE) {
        if (file.endsWith(`/${key}.jpg`)) return code;
      }
      return null;
    },
    entries() {
      return Array.from(IMAGE_BY_CODE.entries()).map(([code, file]) => ({ code, file }));
    }
  };
})();