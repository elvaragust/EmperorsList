import type { RawFile } from '../bsdata/raw';

/**
 * A made-up catalogue with the same shape as BSData wh40k-11e JSON:
 * a unit with a model group, models that pull weapons in through entryLinks
 * to a library catalogue, and costs. No real game text.
 */
export const libraryFile: RawFile = {
  catalogue: {
    id: 'lib-1',
    name: 'Test Library',
    revision: 1,
    library: true,
    sharedSelectionEntries: [
      {
        id: 'w-pistol',
        name: 'Test Pistol',
        type: 'upgrade',
        profiles: [
          {
            id: 'p-pistol',
            name: 'Test Pistol',
            typeId: 't-r',
            typeName: 'Ranged Weapons',
            characteristics: [
              { name: 'Range', typeId: 'a', $text: '12"' },
              { name: 'A', typeId: 'b', $text: '1' },
              { name: 'BS', typeId: 'c', $text: '3+' },
              { name: 'S', typeId: 'd', $text: '4' },
              { name: 'AP', typeId: 'e', $text: '0' },
              { name: 'D', typeId: 'f', $text: '1' },
              { name: 'Keywords', typeId: 'g', $text: 'Close-quarters' },
            ],
          },
        ],
      },
      {
        id: 'w-blade',
        name: 'Test Blade',
        type: 'upgrade',
        profiles: [
          {
            id: 'p-blade',
            name: 'Test Blade',
            typeId: 't-m',
            typeName: 'Melee Weapons',
            characteristics: [
              { name: 'Range', typeId: 'a', $text: 'Melee' },
              { name: 'A', typeId: 'b', $text: '3' },
              { name: 'WS', typeId: 'c', $text: '3+' },
              { name: 'S', typeId: 'd', $text: '4' },
              { name: 'AP', typeId: 'e', $text: '-1' },
              { name: 'D', typeId: 'f', $text: '1' },
              { name: 'Keywords', typeId: 'g', $text: '-' },
            ],
          },
        ],
      },
    ],
  },
};

export const factionFile: RawFile = {
  catalogue: {
    id: 'cat-1',
    name: 'Test Faction',
    revision: 1,
    catalogueLinks: [{ id: 'cl', name: 'Test Library', targetId: 'lib-1', type: 'catalogue' }],
    entryLinks: [{ id: 'el-1', name: 'Test Squad', targetId: 'u-squad', type: 'selectionEntry' }],
    sharedSelectionEntries: [
      {
        id: 'u-squad',
        name: 'Test Squad',
        type: 'unit',
        costs: [{ name: 'pts', typeId: 'pts', value: 100 }],
        categoryLinks: [{ id: 'c1', name: 'Battleline', targetId: 'bl', type: 'category', primary: true }],
        selectionEntryGroups: [
          {
            id: 'g-troopers',
            name: 'Troopers',
            constraints: [{ id: 'k1', type: 'min', value: 4, field: 'selections', scope: 'parent' }],
            selectionEntries: [
              {
                id: 'm-trooper',
                name: 'Trooper',
                type: 'model',
                entryLinks: [
                  { id: 'l1', name: 'Test Pistol', targetId: 'w-pistol', type: 'selectionEntry' },
                  { id: 'l2', name: 'Test Blade', targetId: 'w-blade', type: 'selectionEntry' },
                ],
              },
            ],
          },
        ],
        selectionEntries: [
          {
            id: 'm-sarge',
            name: 'Sergeant',
            type: 'model',
            entryLinks: [{ id: 'l3', name: 'Test Blade', targetId: 'w-blade', type: 'selectionEntry' }],
          },
        ],
      },
    ],
  },
};

/** The same faction catalogue as BattleScribe XML (older repos use this format). */
export const factionXml = `<?xml version="1.0" encoding="UTF-8"?>
<catalogue id="cat-1" name="Test Faction" revision="1" xmlns="http://www.battlescribe.net/schema/catalogueSchema">
  <catalogueLinks><catalogueLink id="cl" name="Test Library" targetId="lib-1" type="catalogue"/></catalogueLinks>
  <entryLinks><entryLink id="el-1" name="Test Squad" targetId="u-squad" type="selectionEntry"/></entryLinks>
  <sharedSelectionEntries>
    <selectionEntry id="u-squad" name="Test Squad" type="unit">
      <costs><cost name="pts" typeId="pts" value="100"/></costs>
      <selectionEntryGroups>
        <selectionEntryGroup id="g-troopers" name="Troopers">
          <selectionEntries>
            <selectionEntry id="m-trooper" name="Trooper" type="model">
              <entryLinks>
                <entryLink id="l1" name="Test Pistol" targetId="w-pistol" type="selectionEntry"/>
                <entryLink id="l2" name="Test Blade" targetId="w-blade" type="selectionEntry"/>
              </entryLinks>
            </selectionEntry>
          </selectionEntries>
        </selectionEntryGroup>
      </selectionEntryGroups>
      <selectionEntries>
        <selectionEntry id="m-sarge" name="Sergeant" type="model">
          <entryLinks><entryLink id="l3" name="Test Blade" targetId="w-blade" type="selectionEntry"/></entryLinks>
        </selectionEntry>
      </selectionEntries>
    </selectionEntry>
  </sharedSelectionEntries>
</catalogue>`;
