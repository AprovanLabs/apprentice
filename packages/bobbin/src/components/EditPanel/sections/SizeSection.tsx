import type { DesignTokens } from '../../../types';
import { SectionWrapper } from './SectionWrapper';
import { SliderInput } from '../controls/SliderInput';

interface SizeSectionProps {
  expanded: boolean;
  onToggle: () => void;
  computedStyle: CSSStyleDeclaration;
  onApplyStyle: (property: string, value: string) => void;
  tokens: DesignTokens;
  hasChanges?: boolean;
}

export function SizeSection({
  expanded,
  onToggle,
  computedStyle,
  onApplyStyle,
  hasChanges = false,
}: SizeSectionProps) {
  const width = parseFloat(computedStyle.width) || 0;
  const height = parseFloat(computedStyle.height) || 0;
  const minWidth = parseFloat(computedStyle.minWidth) || 0;
  const maxWidth = parseFloat(computedStyle.maxWidth) || 0;
  const minHeight = parseFloat(computedStyle.minHeight) || 0;
  const maxHeight = parseFloat(computedStyle.maxHeight) || 0;

  return (
    <SectionWrapper title="Size" expanded={expanded} onToggle={onToggle} hasChanges={hasChanges}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <SliderInput
          label="W"
          value={width}
          min={0}
          max={1000}
          onChange={(v) => onApplyStyle('width', `${v}px`)}
        />
        <SliderInput
          label="H"
          value={height}
          min={0}
          max={1000}
          onChange={(v) => onApplyStyle('height', `${v}px`)}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <SliderInput
          label="Min W"
          value={minWidth}
          min={0}
          max={1000}
          onChange={(v) => onApplyStyle('min-width', `${v}px`)}
        />
        <SliderInput
          label="Max W"
          value={maxWidth}
          min={0}
          max={2000}
          onChange={(v) => onApplyStyle('max-width', `${v}px`)}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <SliderInput
          label="Min H"
          value={minHeight}
          min={0}
          max={1000}
          onChange={(v) => onApplyStyle('min-height', `${v}px`)}
        />
        <SliderInput
          label="Max H"
          value={maxHeight}
          min={0}
          max={2000}
          onChange={(v) => onApplyStyle('max-height', `${v}px`)}
        />
      </div>
    </SectionWrapper>
  );
}
