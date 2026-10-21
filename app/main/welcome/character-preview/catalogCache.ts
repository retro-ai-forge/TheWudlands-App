/**
 * Module-level promise caches for static catalog endpoints.
 *
 * Each catalog is fetched at most once per page session. Subsequent calls
 * (from any component, on any mount) share the same in-flight or resolved
 * promise — no duplicate network requests.
 */

import type { BlueprintTierInfo, ResourceTierInfo } from "./VaultTab";

let _resourceCatalog: Promise<ResourceTierInfo> | null = null;
let _toolCatalog: Promise<BlueprintTierInfo> | null = null;
let _itemCatalog: Promise<BlueprintTierInfo> | null = null;
let _blueprintCatalog: Promise<BlueprintTierInfo> | null = null;

export function getResourceCatalog(): Promise<ResourceTierInfo> {
  if (!_resourceCatalog) {
    _resourceCatalog = fetch("/api/auth/resource-catalog")
      .then((res) => (res.ok ? res.json() : []))
      .then(
        (data: Array<{
          id: string;
          name: string;
          familyId: string;
          tier: number;
          resourceFamily: string;
          category: "raw" | "processed";
          icon?: string | null;
          description?: string;
        }>) => {
          const map: ResourceTierInfo = {};
          for (const item of data) {
            map[item.id] = {
              tier: item.tier,
              family: item.resourceFamily,
              category: item.category,
              name: item.name,
              icon: item.icon ?? undefined,
              description: item.description || undefined,
            };
          }
          return map;
        }
      )
      .catch(() => ({}));
  }
  return _resourceCatalog;
}

export function getToolCatalog(): Promise<BlueprintTierInfo> {
  if (!_toolCatalog) {
    _toolCatalog = fetch("/api/auth/tool-catalog")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Array<{ id: string; name: string; familyId: string; tier: number; kind: string[]; icon: string; sizeClass: string; stackSize: number; equipSlots: string[][]; backpackable: boolean }>) => {
        const map: BlueprintTierInfo = {};
        for (const item of data) {
          map[item.id] = {
            tier: item.tier,
            familyId: item.familyId,
            kind: item.kind?.[0] ?? "tool",
            name: item.name,
            icon: item.icon || undefined,
            sizeClass: item.sizeClass,
            stackSize: item.stackSize,
            equipSlots: item.equipSlots,
            backpackable: item.backpackable,
          };
        }
        return map;
      })
      .catch(() => ({}));
  }
  return _toolCatalog;
}

export function getItemCatalog(): Promise<BlueprintTierInfo> {
  if (!_itemCatalog) {
    _itemCatalog = fetch("/api/auth/item-catalog")
      .then((res) => (res.ok ? res.json() : []))
      .then(
        (data: Array<{
          id: string;
          name: string;
          familyId: string;
          tier: number;
          kind: string[];
          qualityMax: number | null;
          armorClass: number | null;
          icon: string;
          stackSize: number;
          description: string;
          sizeClass: string;
          size: string;
          equipSlots: string[][];
          backpackable: boolean;
          gatheringBonuses: string[];
          capacitySlots: number;
          carryCapacity: number;
        }>) => {
          const map: BlueprintTierInfo = {};
          for (const item of data) {
            map[item.id] = {
              tier: item.tier,
              familyId: item.familyId,
              kind: item.kind[0] ?? "",
              name: item.name,
              qualityMax: item.qualityMax,
              armorClass: item.armorClass,
              icon: item.icon,
              stackSize: item.stackSize,
              description: item.description,
              sizeClass: item.sizeClass,
              size: item.size,
              equipSlots: item.equipSlots,
              backpackable: item.backpackable,
              gatheringBonuses: item.gatheringBonuses,
              capacitySlots: item.capacitySlots,
              carryCapacity: item.carryCapacity,
            };
          }
          return map;
        }
      )
      .catch(() => ({}));
  }
  return _itemCatalog;
}

export function getBlueprintCatalog(): Promise<BlueprintTierInfo> {
  if (!_blueprintCatalog) {
    _blueprintCatalog = fetch("/api/auth/blueprint-categories")
      .then((res) => (res.ok ? res.json() : []))
      .then(
        (data: Array<{
          families: Array<{
            familyId: string;
            kind: string;
            items: Array<{ id: string; name: string; tier: number }>;
          }>;
        }>) => {
          const info: BlueprintTierInfo = {};
          for (const entry of data) {
            for (const family of entry.families) {
              for (const item of family.items) {
                info[item.id] = { tier: item.tier, familyId: family.familyId, kind: family.kind, name: item.name };
              }
            }
          }
          return info;
        }
      )
      .catch(() => ({}));
  }
  return _blueprintCatalog;
}
