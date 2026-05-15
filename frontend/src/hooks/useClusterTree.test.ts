import { describe, expect, it } from 'vitest';
import {
  assembleClusterTree,
  collectDescendantClusters,
  collectDescendantGroupIds,
} from './useClusterTree';
import type { Cluster, Group } from '../types';

const g = (id: string, parent: string | null, order = 0): Group => ({
  id,
  name: id,
  parent_id: parent,
  color: null,
  icon: null,
  description: null,
  order,
});

const c = (
  id: string,
  parent: string | null,
  order = 0
): Cluster => ({
  id,
  name: id,
  bootstrap_servers: 'localhost:9092',
  parent_group_id: parent,
  order,
});

describe('assembleClusterTree', () => {
  it('places top-level groups under roots', () => {
    const tree = assembleClusterTree([g('A', null), g('B', null)], []);
    expect(tree.roots.map((r) => r.group.id)).toEqual(['A', 'B']);
  });

  it('nests child groups under their parent', () => {
    const tree = assembleClusterTree(
      [g('A', null), g('A1', 'A'), g('A2', 'A')],
      []
    );
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].children.map((c) => c.group.id)).toEqual(['A1', 'A2']);
  });

  it('sorts siblings by (order, id)', () => {
    const tree = assembleClusterTree(
      [g('Z', null, 10), g('A', null, 10), g('M', null, 5)],
      []
    );
    expect(tree.roots.map((r) => r.group.id)).toEqual(['M', 'A', 'Z']);
  });

  it('puts clusters with unknown parent into ungrouped', () => {
    const tree = assembleClusterTree([], [c('cl', 'missing-group')]);
    expect(tree.ungrouped.map((cl) => cl.id)).toEqual(['cl']);
  });

  it('puts clusters with null parent into ungrouped', () => {
    const tree = assembleClusterTree([], [c('cl', null)]);
    expect(tree.ungrouped.map((cl) => cl.id)).toEqual(['cl']);
  });

  it('attaches clusters to their groups', () => {
    const tree = assembleClusterTree(
      [g('A', null)],
      [c('cl1', 'A'), c('cl2', 'A')]
    );
    expect(tree.roots[0].clusters.map((c) => c.id)).toEqual(['cl1', 'cl2']);
  });

  it('sets depth based on parent chain', () => {
    const tree = assembleClusterTree(
      [g('A', null), g('A1', 'A'), g('A1a', 'A1')],
      []
    );
    expect(tree.roots[0].depth).toBe(0);
    expect(tree.roots[0].children[0].depth).toBe(1);
    expect(tree.roots[0].children[0].children[0].depth).toBe(2);
  });
});

describe('collectDescendantClusters', () => {
  it('collects clusters from self + all descendants', () => {
    const tree = assembleClusterTree(
      [g('A', null), g('A1', 'A')],
      [c('top', 'A'), c('nested', 'A1')]
    );
    const ids = collectDescendantClusters(tree.roots[0]).map((c) => c.id);
    expect(ids).toEqual(['top', 'nested']);
  });
});

describe('collectDescendantGroupIds', () => {
  it('returns all nested group ids (excluding self)', () => {
    const tree = assembleClusterTree(
      [g('A', null), g('A1', 'A'), g('A1a', 'A1'), g('B', null)],
      []
    );
    const ids = collectDescendantGroupIds(tree.roots[0]);
    expect([...ids].sort()).toEqual(['A1', 'A1a']);
  });
});
