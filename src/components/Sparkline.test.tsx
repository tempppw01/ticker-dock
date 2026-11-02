import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Sparkline } from './Sparkline'

describe('Sparkline', () => {
  it('renders an intraday line above the previous close', () => {
    render(
      <Sparkline
        previousClose={100}
        points={[
          { time: '09:30', price: 100.2 },
          { time: '09:31', price: 101.4 },
          { time: '09:32', price: 101.1 },
        ]}
      />,
    )

    expect(screen.getByRole('img', { name: '分时走势' })).toBeInTheDocument()
    expect(document.querySelector('.sparkline-line')).toHaveAttribute(
      'd',
      expect.stringContaining('M0.00'),
    )
  })
})
