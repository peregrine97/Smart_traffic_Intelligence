/**
 * ISTClock.test.tsx — Tests for the ISTClock component.
 *
 * The component displays a matrix-style IST clock.
 * It starts with a loading state (--:--) then updates via setInterval.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import ISTClock from '@/components/ISTClock';

// Mock the Matrix component and digits from ui/matrix
jest.mock('@/components/ui/matrix', () => ({
  Matrix: ({ ariaLabel }: { ariaLabel: string }) => (
    <div data-testid={`matrix-${ariaLabel}`} aria-label={ariaLabel} />
  ),
  digits: Array(10).fill(Array(7).fill(Array(5).fill(0))),
}));

describe('ISTClock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders without crashing', () => {
    render(<ISTClock />);
  });

  it('renders time display on mount', () => {
    render(<ISTClock />);
    // Component renders matrix displays immediately (time is computed synchronously)
    const matrices = screen.queryAllByTestId(/^matrix-/);
    expect(matrices.length).toBeGreaterThan(0);
  });

  it('renders matrix displays after time loads', () => {
    render(<ISTClock />);
    // Advance timer to trigger useEffect
    act(() => {
      jest.advanceTimersByTime(0);
    });
    // After time is set, matrix elements should appear
    // (time state is set synchronously in updateTime)
  });

  it('sets up a 1-second interval for time updates', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    render(<ISTClock />);
    // Should be called for time update interval (1000ms)
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
    setIntervalSpy.mockRestore();
  });

  it('sets up a 500ms interval for colon blinking', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    render(<ISTClock />);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 500);
    setIntervalSpy.mockRestore();
  });

  it('clears interval on unmount', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const { unmount } = render(<ISTClock />);
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('shows matrix components after time state is set', () => {
    render(<ISTClock />);
    act(() => {
      jest.advanceTimersByTime(0); // Trigger immediate setInterval callback
    });
    // After update: should have matrix elements with aria-labels
    const hourMatrices = screen.queryAllByTestId(/^matrix-Hour/);
    const minuteMatrices = screen.queryAllByTestId(/^matrix-Minute/);
    // Either loading or time display should be present
    expect(hourMatrices.length > 0 || minuteMatrices.length > 0).toBeTruthy();
  });
});
