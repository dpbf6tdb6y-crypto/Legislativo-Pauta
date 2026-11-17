'use client';
export default function Imprimir() {
  return <button className="btn" onClick={() => window.print()}>Imprimir / salvar em PDF</button>;
}
