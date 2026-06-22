import { describe, it, expect } from 'vitest'
import { uciToSan, toFigurine } from '~/lib/notation'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('uciToSan', () => {
  it('names a knight move (no from-square when unambiguous)', () => {
    expect(uciToSan(START, 'b1a3')).toBe('Na3')
    expect(uciToSan(START, 'g1f3')).toBe('Nf3')
  })

  it('drops the piece letter for a pawn move', () => {
    expect(uciToSan(START, 'e2e4')).toBe('e4')
  })

  it('reads the promotion piece from the 5th char', () => {
    // King on h5 so the new queen gives no check — keeps the SAN a bare 'a8=Q'.
    expect(uciToSan('8/P7/8/7k/8/8/8/4K3 w - - 0 1', 'a7a8q')).toBe('a8=Q')
  })

  it('returns null for an illegal move', () => {
    expect(uciToSan(START, 'e2e5')).toBeNull()
  })
})

describe('toFigurine', () => {
  it('swaps the leading piece letter for its glyph', () => {
    expect(toFigurine('Na3')).toBe('♞a3')
    expect(toFigurine('Qxd5')).toBe('♛xd5')
  })

  it('keeps check, capture and disambiguation marks', () => {
    expect(toFigurine('Bxf7+')).toBe('♝xf7+')
    expect(toFigurine('Nbd7')).toBe('♞bd7')
  })

  it('figurines a promotion piece too', () => {
    expect(toFigurine('e8=Q')).toBe('e8=♛')
  })

  it('leaves pawn moves and castling unchanged', () => {
    expect(toFigurine('exd5')).toBe('exd5')
    expect(toFigurine('e4')).toBe('e4')
    expect(toFigurine('O-O')).toBe('O-O')
    expect(toFigurine('O-O-O')).toBe('O-O-O')
  })
})
