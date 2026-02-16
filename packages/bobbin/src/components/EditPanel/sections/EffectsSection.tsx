import type { DesignTokens } from '../../../types';
import { SectionWrapper } from './SectionWrapper';
import { TokenDropdown } from '../controls/TokenDropdown';
import { SliderInput } from '../controls/SliderInput';

interface EffectsSectionProps {
  expanded: boolean;
  onToggle: () => void;
  computedStyle: CSSStyleDeclaration;
  onApplyStyle: (property: string, value: string) => void;
  tokens: DesignTokens;
  hasChanges?: boolean;
}

export function EffectsSection({
  expanded,
  onToggle,
  computedStyle,
  onApplyStyle,
  tokens,
  hasChanges = false,
}: EffectsSectionProps) {
  const boxShadow = computedStyle.boxShadow;
  const opacity = parseFloat(computedStyle.opacity) * 100;

  return (
    <SectionWrapper title="Effects" expanded={expanded} onToggle={onToggle} hasChanges={hasChanges}>
      {/* Box Shadow */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '10px', color: '#71717a', marginBottom: '4px', display: 'block' }}>
          Shadow
        </label>
        <TokenDropdown
          value={boxShadow}
          tokens={tokens.boxShadow}
          onChange={(value) => onApplyStyle('box-shadow', value)}
        />
      </div>

      {/* Opacity */}
      <div>
        <label style={{ fontSize: '10px', color: '#71717a', marginBottom: '4px', display: 'block' }}>
          Opacity
        </label>
        <SliderInput
          value={opacity}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={(value) => onApplyStyle('opacity', String(value / 100))}
        />
      </div>
    </SectionWrapper>
  );
}
