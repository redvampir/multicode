import React, { useMemo } from 'react';
import type { UeMacroBinding, UeMacroTargetKind } from '../shared/blueprintTypes';
import { renderUeMacroString, UE_MACRO_COLORS } from '../shared/blueprintTypes';

interface UeMacroBadgeListProps {
  macros?: UeMacroBinding[] | null;
  targetId?: string | null;
  targetKind: UeMacroTargetKind;
  displayLanguage: 'ru' | 'en';
  className?: string;
}

export const UeMacroBadgeList: React.FC<UeMacroBadgeListProps> = ({
  macros,
  targetId,
  targetKind,
  displayLanguage,
  className,
}) => {
  const targetMacros = useMemo(
    () =>
      (macros ?? []).filter(
        (macro) => macro.targetId === targetId && macro.targetKind === targetKind,
      ),
    [macros, targetId, targetKind],
  );

  if (!targetId || targetMacros.length === 0) {
    return null;
  }

  const titlePrefix = displayLanguage === 'ru' ? 'Макрос UE' : 'UE macro';
  const resolvedClassName = ['ue-inline-macro-list', className].filter(Boolean).join(' ');

  return (
    <div
      className={resolvedClassName}
      data-testid={`ue-macro-badges-${targetKind}-${targetId}`}
    >
      {targetMacros.map((macro) => (
        <span
          key={macro.id}
          className="ue-inline-macro-chip"
          style={
            {
              '--ue-macro-accent': UE_MACRO_COLORS[macro.macroType],
            } as React.CSSProperties
          }
          title={`${titlePrefix}: ${renderUeMacroString(macro)}`}
          data-testid={`ue-macro-badge-${targetKind}-${targetId}-${macro.id}`}
        >
          {macro.macroType}
        </span>
      ))}
    </div>
  );
};

export default UeMacroBadgeList;
