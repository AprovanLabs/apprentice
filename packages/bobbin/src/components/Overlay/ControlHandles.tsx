import { useState, useMemo, useCallback, useEffect } from 'react';
import type { SelectedElement, BobbinActions } from '../../types';

interface ControlHandlesProps {
  selectedElement: SelectedElement;
  actions: BobbinActions;
  clipboard: SelectedElement | null;
  zIndex?: number;
}

type HandlePosition = 'top' | 'bottom' | 'left' | 'right';

// Determine layout direction based on parent's flex/grid direction
function getLayoutDirection(element: HTMLElement): 'horizontal' | 'vertical' | 'unknown' {
  const parent = element.parentElement;
  if (!parent) return 'unknown';
  
  const style = getComputedStyle(parent);
  const display = style.display;
  const flexDirection = style.flexDirection;
  
  if (display.includes('flex')) {
    if (flexDirection === 'column' || flexDirection === 'column-reverse') {
      return 'vertical';
    }
    return 'horizontal';
  }
  
  if (display.includes('grid')) {
    // Simplified: assume row-based grid is horizontal
    return 'horizontal';
  }
  
  return 'vertical'; // Default to vertical for block layout
}

export function ControlHandles({
  selectedElement,
  actions,
  clipboard,
  zIndex = 9999,
}: ControlHandlesProps) {
  const [hoveredEdge, setHoveredEdge] = useState<HandlePosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<HTMLElement | null>(null);
  const { rect } = selectedElement;

  const layoutDirection = useMemo(
    () => getLayoutDirection(selectedElement.element),
    [selectedElement.element]
  );

  // Smaller handle size
  const cornerHandleSize = 18;

  // Icons (simplified SVG) - all monochrome, smaller size
  const TrashIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );

  const CopyIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );

  const MoveIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="5 9 2 12 5 15" />
      <polyline points="9 5 12 2 15 5" />
      <polyline points="15 19 12 22 9 19" />
      <polyline points="19 9 22 12 19 15" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="12" y1="2" x2="12" y2="22" />
    </svg>
  );

  const PlusIcon = () => (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );

  const DuplicateIcon = () => (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <rect x="4" y="4" width="12" height="12" rx="2" />
    </svg>
  );

  const PasteIcon = () => (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
    </svg>
  );

  // Handle mouse move during drag to find drop target
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    // Get element at point, excluding bobbin elements
    const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
    const target = elementsAtPoint.find(el => 
      !el.hasAttribute('data-bobbin') && 
      el !== selectedElement.element &&
      !selectedElement.element.contains(el) &&
      el instanceof HTMLElement &&
      el.tagName !== 'HTML' &&
      el.tagName !== 'BODY'
    ) as HTMLElement | undefined;
    
    if (target !== dropTarget) {
      // Remove highlight from previous target
      if (dropTarget) {
        dropTarget.style.outline = '';
        dropTarget.style.outlineOffset = '';
      }
      
      // Highlight new target
      if (target) {
        target.style.outline = '2px dashed #3b82f6';
        target.style.outlineOffset = '2px';
      }
      
      setDropTarget(target || null);
    }
  }, [isDragging, dropTarget, selectedElement.element]);

  // Handle mouse up to complete drag
  const handleMouseUp = useCallback(() => {
    if (isDragging && dropTarget) {
      // Move element after the drop target
      const parent = dropTarget.parentElement;
      if (parent) {
        const index = Array.from(parent.children).indexOf(dropTarget) + 1;
        actions.moveElement(parent, index);
      }
      
      // Clean up highlight
      dropTarget.style.outline = '';
      dropTarget.style.outlineOffset = '';
    }
    
    setIsDragging(false);
    setDropTarget(null);
  }, [isDragging, dropTarget, actions]);

  // Set up global event listeners for drag
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'grabbing';
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      
      // Clean up any lingering highlight
      if (dropTarget) {
        dropTarget.style.outline = '';
        dropTarget.style.outlineOffset = '';
      }
    };
  }, [isDragging, handleMouseMove, handleMouseUp, dropTarget]);

  const handleMoveStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
  };

  // Corner button style (for delete/copy at top-left) - dark background with light text
  const cornerButtonStyle = (isHovered: boolean): React.CSSProperties => ({
    width: cornerHandleSize,
    height: cornerHandleSize,
    borderRadius: '3px',
    backgroundColor: isHovered ? '#27272a' : '#18181b',
    color: '#fafafa',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.1s ease',
    boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.2)',
    pointerEvents: 'auto',
  });

  // Edge hover zone styles - invisible by default, shows actions on hover
  const getEdgeZoneStyle = (position: HandlePosition): React.CSSProperties => {
    const hoverZoneSize = 28;
    const isHorizontal = position === 'top' || position === 'bottom';
    
    const base: React.CSSProperties = {
      position: 'fixed',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '3px',
      zIndex,
      transition: 'opacity 0.1s ease',
      pointerEvents: 'auto',
    };

    if (isHorizontal) {
      return {
        ...base,
        left: rect.left,
        width: rect.width,
        height: hoverZoneSize,
        top: position === 'top' ? rect.top - hoverZoneSize : rect.bottom,
        flexDirection: 'row',
      };
    } else {
      return {
        ...base,
        top: rect.top,
        height: rect.height,
        width: hoverZoneSize,
        left: position === 'left' ? rect.left - hoverZoneSize : rect.right,
        flexDirection: 'column',
      };
    }
  };

  // Small action button in edge hover zone - dark background like corner buttons
  const EdgeActionButton = ({
    icon,
    onClick,
    title,
    visible,
  }: {
    icon: React.ReactNode;
    onClick: () => void;
    title: string;
    visible: boolean;
  }) => {
    const [isHovered, setIsHovered] = useState(false);
    
    if (!visible) return null;

    return (
      <button
        style={{
          width: cornerHandleSize,
          height: cornerHandleSize,
          borderRadius: '3px',
          backgroundColor: isHovered ? '#27272a' : '#18181b',
          color: '#fafafa',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.1s ease',
          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.2)',
          pointerEvents: 'auto',
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClick();
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={title}
      >
        {icon}
      </button>
    );
  };

  // Determine insert direction based on edge and layout
  const getInsertDirection = (position: HandlePosition): 'before' | 'after' => {
    if (layoutDirection === 'horizontal') {
      return position === 'left' ? 'before' : 'after';
    } else {
      return position === 'top' ? 'before' : 'after';
    }
  };

  const [cornerHover, setCornerHover] = useState<'delete' | 'copy' | 'move' | null>(null);

  return (
    <div data-bobbin="control-handles" style={{ pointerEvents: 'none' }}>
      {/* Top-left corner: Move, Delete and Copy icons */}
      <div
        style={{
          position: 'fixed',
          top: rect.top - cornerHandleSize - 6,
          left: rect.left,
          display: 'flex',
          gap: '3px',
          zIndex,
          pointerEvents: 'auto',
        }}
      >
        <button
          style={{
            ...cornerButtonStyle(cornerHover === 'move'),
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
          onMouseDown={handleMoveStart}
          onMouseEnter={() => setCornerHover('move')}
          onMouseLeave={() => setCornerHover(null)}
          title="Move element (drag to new location)"
        >
          <MoveIcon />
        </button>
        <button
          style={cornerButtonStyle(cornerHover === 'delete')}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            actions.deleteElement();
          }}
          onMouseEnter={() => setCornerHover('delete')}
          onMouseLeave={() => setCornerHover(null)}
          title="Delete element"
        >
          <TrashIcon />
        </button>
        <button
          style={cornerButtonStyle(cornerHover === 'copy')}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            actions.copyElement();
          }}
          onMouseEnter={() => setCornerHover('copy')}
          onMouseLeave={() => setCornerHover(null)}
          title="Copy element"
        >
          <CopyIcon />
        </button>
      </div>

      {/* Edge hover zones with action buttons */}
      {(['top', 'bottom', 'left', 'right'] as HandlePosition[]).map((position) => {
        const isHovered = hoveredEdge === position;
        const insertDir = getInsertDirection(position);
        
        return (
          <div
            key={position}
            style={getEdgeZoneStyle(position)}
            onMouseEnter={() => setHoveredEdge(position)}
            onMouseLeave={() => setHoveredEdge(null)}
          >
            {isHovered && (
              <>
                <EdgeActionButton
                  icon={<PlusIcon />}
                  onClick={() => actions.insertElement(insertDir)}
                  title={`Add text ${insertDir}`}
                  visible={true}
                />
                <EdgeActionButton
                  icon={<PasteIcon />}
                  onClick={() => actions.pasteElement(insertDir)}
                  title={`Paste ${insertDir}`}
                  visible={!!clipboard}
                />
                <EdgeActionButton
                  icon={<DuplicateIcon />}
                  onClick={actions.duplicateElement}
                  title="Duplicate element"
                  visible={true}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
