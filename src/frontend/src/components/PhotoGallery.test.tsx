import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PhotoGallery } from './PhotoGallery';

// next/image needs the Next runtime; a plain img keeps the alt text under test.
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}));

const base = { photos: [], loading: false, failed: false, placeName: 'Mt Pulag' };

// The point of this component: "the request failed" and "this place has no
// photos" are different facts and must never read the same.
describe('PhotoGallery', () => {
  it('shows a loading status while the request is in flight', () => {
    render(<PhotoGallery {...base} loading />);
    expect(screen.getByRole('status', { name: 'Loading photos' })).toBeInTheDocument();
  });

  it('renders at most six photos, each with descriptive alt text', () => {
    const photos = Array.from({ length: 8 }, (_, i) => `https://example.com/${i}.jpg`);
    render(<PhotoGallery {...base} photos={photos} />);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(6);
    expect(images[0]).toHaveAttribute('alt', 'Mt Pulag — photo 1');
  });

  it('says there are no photos when the request succeeded empty', () => {
    render(<PhotoGallery {...base} />);
    expect(screen.getByText('No photos available')).toBeInTheDocument();
    expect(screen.queryByText(/couldn.t be loaded/)).toBeNull();
  });

  it('says the request failed, and offers a retry when it can', () => {
    const onRetry = vi.fn();
    render(<PhotoGallery {...base} failed onRetry={onRetry} />);
    expect(screen.getByText(/couldn.t be loaded/)).toBeInTheDocument();
    expect(screen.queryByText('No photos available')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('suggests reopening when no retry is wired', () => {
    render(<PhotoGallery {...base} failed />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByText(/Reopening this place/)).toBeInTheDocument();
  });
});
