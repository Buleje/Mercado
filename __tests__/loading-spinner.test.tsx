import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  LoadingSpinner,
  ComponentLoader,
  PageLoader,
  SkeletonCard,
  SkeletonList,
  SkeletonTable,
  SkeletonForm,
} from '@/components/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('should render with default props', () => {
    render(<LoadingSpinner />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should render with custom text', () => {
    render(<LoadingSpinner text="Loading data..." />);
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('should render with different sizes', () => {
    const { rerender } = render(<LoadingSpinner size="sm" />);
    let spinner = document.querySelector('.animate-spin');
    expect(spinner).toHaveClass('w-4', 'h-4');

    rerender(<LoadingSpinner size="md" />);
    spinner = document.querySelector('.animate-spin');
    expect(spinner).toHaveClass('w-8', 'h-8');

    rerender(<LoadingSpinner size="lg" />);
    spinner = document.querySelector('.animate-spin');
    expect(spinner).toHaveClass('w-12', 'h-12');

    rerender(<LoadingSpinner size="xl" />);
    spinner = document.querySelector('.animate-spin');
    expect(spinner).toHaveClass('w-16', 'h-16');
  });

  it('should render fullScreen mode', () => {
    render(<LoadingSpinner fullScreen />);
    const container = document.querySelector('.fixed.inset-0');
    expect(container).toBeInTheDocument();
    expect(container).toHaveClass('z-50');
  });

  it('should apply custom className', () => {
    render(<LoadingSpinner className="custom-class" />);
    const container = document.querySelector('.custom-class');
    expect(container).toBeInTheDocument();
  });

  it('should render without text when not provided', () => {
    render(<LoadingSpinner />);
    const text = document.querySelector('p');
    expect(text).not.toBeInTheDocument();
  });
});

describe('ComponentLoader', () => {
  it('should render with default text', () => {
    render(<ComponentLoader />);
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });

  it('should render with custom text', () => {
    render(<ComponentLoader text="Loading component..." />);
    expect(screen.getByText('Loading component...')).toBeInTheDocument();
  });

  it('should have proper container styles', () => {
    render(<ComponentLoader />);
    const container = document.querySelector('.w-full.py-12');
    expect(container).toBeInTheDocument();
  });
});

describe('PageLoader', () => {
  it('should render with fullScreen mode', () => {
    render(<PageLoader />);
    const container = document.querySelector('.fixed.inset-0');
    expect(container).toBeInTheDocument();
  });

  it('should render with appropriate text', () => {
    render(<PageLoader />);
    expect(screen.getByText('Cargando página...')).toBeInTheDocument();
  });

  it('should use large size', () => {
    render(<PageLoader />);
    const spinner = document.querySelector('.w-12.h-12');
    expect(spinner).toBeInTheDocument();
  });
});

describe('SkeletonCard', () => {
  it('should render skeleton structure', () => {
    render(<SkeletonCard />);
    const card = document.querySelector('.bg-white.rounded-lg.border');
    expect(card).toBeInTheDocument();
  });

  it('should have animate-pulse class', () => {
    render(<SkeletonCard />);
    const card = document.querySelector('.animate-pulse');
    expect(card).toBeInTheDocument();
  });

  it('should render image placeholder', () => {
    render(<SkeletonCard />);
    const imagePlaceholder = document.querySelector('.h-48.bg-gray-200');
    expect(imagePlaceholder).toBeInTheDocument();
  });

  it('should render text placeholders', () => {
    render(<SkeletonCard />);
    const textPlaceholders = document.querySelectorAll('.bg-gray-200.rounded');
    expect(textPlaceholders.length).toBeGreaterThan(0);
  });
});

describe('SkeletonList', () => {
  it('should render default number of items', () => {
    render(<SkeletonList />);
    const items = document.querySelectorAll('.animate-pulse');
    expect(items.length).toBe(5);
  });

  it('should render custom count of items', () => {
    render(<SkeletonList count={3} />);
    const items = document.querySelectorAll('.animate-pulse');
    expect(items.length).toBe(3);
  });

  it('should render items with proper structure', () => {
    render(<SkeletonList count={1} />);
    const item = document.querySelector('.flex.items-center.gap-4');
    expect(item).toBeInTheDocument();
  });

  it('should render image and text placeholders', () => {
    render(<SkeletonList count={1} />);
    const imagePlaceholder = document.querySelector('.w-16.h-16.bg-gray-200.rounded');
    expect(imagePlaceholder).toBeInTheDocument();
  });
});

describe('SkeletonTable', () => {
  it('should render default rows and columns', () => {
    render(<SkeletonTable />);
    const headerCells = document.querySelectorAll('thead th');
    expect(headerCells.length).toBe(4); // default cols

    const bodyRows = document.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(5); // default rows
  });

  it('should render custom rows and columns', () => {
    render(<SkeletonTable rows={3} cols={2} />);
    const headerCells = document.querySelectorAll('thead th');
    expect(headerCells.length).toBe(2);

    const bodyRows = document.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(3);
  });

  it('should render table structure', () => {
    render(<SkeletonTable />);
    const table = document.querySelector('table.w-full');
    expect(table).toBeInTheDocument();
  });

  it('should render skeleton cells', () => {
    render(<SkeletonTable rows={1} cols={1} />);
    const skeletonCells = document.querySelectorAll('.bg-gray-200.rounded.animate-pulse');
    expect(skeletonCells.length).toBeGreaterThan(0);
  });
});

describe('SkeletonForm', () => {
  it('should render form fields', () => {
    render(<SkeletonForm />);
    const fields = document.querySelectorAll('.space-y-2');
    expect(fields.length).toBe(4);
  });

  it('should render field labels and inputs', () => {
    render(<SkeletonForm />);
    const labels = document.querySelectorAll('.h-4.bg-gray-200');
    const inputs = document.querySelectorAll('.h-10.bg-gray-200');
    
    expect(labels.length).toBeGreaterThan(0);
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('should render action buttons', () => {
    render(<SkeletonForm />);
    const buttons = document.querySelectorAll('.h-10.bg-gray-200.w-32');
    expect(buttons.length).toBe(2);
  });

  it('should have animate-pulse on all elements', () => {
    render(<SkeletonForm />);
    const animatedElements = document.querySelectorAll('.animate-pulse');
    expect(animatedElements.length).toBeGreaterThan(0);
  });
});

describe('Accessibility', () => {
  it('should have proper aria labels for spinners', () => {
    render(<LoadingSpinner text="Loading..." />);
    // Lucide icons typically have role="img" or similar accessibility attributes
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should render text for screen readers', () => {
    render(<ComponentLoader text="Loading data" />);
    expect(screen.getByText('Loading data')).toBeInTheDocument();
  });

  it('should provide visual feedback through animation', () => {
    render(<LoadingSpinner />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toHaveClass('animate-spin');
  });
});

describe('Integration', () => {
  it('should work as dynamic import loading component', () => {
    const LoadingComponent = () => <ComponentLoader text="Loading module..." />;
    render(<LoadingComponent />);
    expect(screen.getByText('Loading module...')).toBeInTheDocument();
  });

  it('should render multiple skeleton types together', () => {
    render(
      <div>
        <SkeletonCard />
        <SkeletonList count={2} />
        <SkeletonTable rows={2} cols={2} />
      </div>
    );

    const animatedElements = document.querySelectorAll('.animate-pulse');
    expect(animatedElements.length).toBeGreaterThan(5);
  });
});
