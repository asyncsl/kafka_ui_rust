import { useMemo } from 'react';
import type { Cluster, Group } from '../types';

export interface GroupTreeNode {
  group: Group;
  children: GroupTreeNode[];
  clusters: Cluster[];
  depth: number;
}

export interface ClusterTree {
  roots: GroupTreeNode[];
  ungrouped: Cluster[];
  byId: Map<string, GroupTreeNode>;
}

export function assembleClusterTree(
  groups: Group[],
  clusters: Cluster[]
): ClusterTree {
  const sortFn = <T extends { id: string; order: number }>(a: T, b: T) =>
    a.order === b.order ? a.id.localeCompare(b.id) : a.order - b.order;

  const sortedGroups = [...groups].sort(sortFn);
  const sortedClusters = [...clusters].sort(sortFn);

  const byId = new Map<string, GroupTreeNode>();
  for (const g of sortedGroups) {
    byId.set(g.id, { group: g, children: [], clusters: [], depth: 0 });
  }

  const roots: GroupTreeNode[] = [];
  for (const g of sortedGroups) {
    const node = byId.get(g.id)!;
    if (g.parent_id && byId.has(g.parent_id)) {
      const parent = byId.get(g.parent_id)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const ungrouped: Cluster[] = [];
  for (const c of sortedClusters) {
    if (c.parent_group_id && byId.has(c.parent_group_id)) {
      byId.get(c.parent_group_id)!.clusters.push(c);
    } else {
      ungrouped.push(c);
    }
  }

  return { roots, ungrouped, byId };
}

export function collectDescendantClusters(node: GroupTreeNode): Cluster[] {
  const out: Cluster[] = [...node.clusters];
  for (const child of node.children) {
    out.push(...collectDescendantClusters(child));
  }
  return out;
}

export function collectDescendantGroupIds(node: GroupTreeNode): Set<string> {
  const out = new Set<string>();
  const walk = (n: GroupTreeNode) => {
    for (const c of n.children) {
      out.add(c.group.id);
      walk(c);
    }
  };
  walk(node);
  return out;
}

export function useClusterTree(groups: Group[], clusters: Cluster[]): ClusterTree {
  return useMemo(() => assembleClusterTree(groups, clusters), [groups, clusters]);
}
