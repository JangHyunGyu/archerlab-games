/** Original compass, triangles and reagent marks; vector strokes stay crisp at every scale. */
export function AlchemySeal() {
  return <span className="alchemy-seal" aria-hidden="true"><svg viewBox="-64 -64 128 128">
    <g className="alchemy-orbit"><circle r="58"/><circle r="53"/>
      {Array.from({ length: 24 }, (_, i) => <path key={i} transform={`rotate(${i * 15})`} d={i % 3 ? 'M0-54v-3' : 'M-2-50v-6h4v6m-2-4v7'}/>)}</g>
    <g className="alchemy-core"><circle r="42"/><path d="M0-43 37 22H-37Zm0 86L37-22H-37Z"/><circle r="25"/>
      <path d="M0-19V19M-19 0H19M-8-8 8 8M8-8-8 8"/><circle r="6"/>
      <path d="M0-63v12m0 102v12M-63 0h12m102 0h12"/></g>
  </svg></span>;
}
