import { render, screen } from '@testing-library/react';
import DocumentTitle from './DocumentTitle';

test('renders filename only when title is null', () => {
  render(<DocumentTitle title={null} filename="paper.pdf" />);
  expect(screen.getByText('paper.pdf')).toBeInTheDocument();
  expect(screen.queryByRole('generic', { name: /paper\.pdf/i })).toBeDefined();
});

test('renders filename only when title is undefined', () => {
  render(<DocumentTitle filename="paper.pdf" />);
  expect(screen.getByText('paper.pdf')).toBeInTheDocument();
});

test('renders title and filename sub-line when title is present', () => {
  render(<DocumentTitle title="My Research Paper" filename="paper.pdf" />);
  expect(screen.getByText('My Research Paper')).toBeInTheDocument();
  expect(screen.getByText('paper.pdf')).toBeInTheDocument();
});

test('applies line-clamp-2 to title when clamp is true', () => {
  render(<DocumentTitle title="My Research Paper" filename="paper.pdf" clamp={true} />);
  expect(screen.getByText('My Research Paper')).toHaveClass('line-clamp-2');
});

test('does not apply line-clamp-2 to title when clamp is false', () => {
  render(<DocumentTitle title="My Research Paper" filename="paper.pdf" clamp={false} />);
  expect(screen.getByText('My Research Paper')).not.toHaveClass('line-clamp-2');
});

test('applies line-clamp-2 by default when clamp prop is omitted', () => {
  render(<DocumentTitle title="My Research Paper" filename="paper.pdf" />);
  expect(screen.getByText('My Research Paper')).toHaveClass('line-clamp-2');
});

test('filename sub-line uses monospace font class', () => {
  render(<DocumentTitle title="My Research Paper" filename="paper.pdf" />);
  expect(screen.getByText('paper.pdf')).toHaveClass('font-mono');
});
