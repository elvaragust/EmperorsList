export { isLegends, legendsName } from '@/engine/rules/legends';

/** Tag shown next to a Legends datasheet's name. */
export function LegendsTag() {
  return (
    <span className="tag legends-tag" title="Warhammer Legends: not for matched play unless your group agrees">
      LEGENDS
    </span>
  );
}
