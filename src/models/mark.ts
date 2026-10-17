export interface MarkInfo {
  id?: string;
  markName: string;
  markUrl: string;
  markIcon: string;
  markGroupId: string;
}

export interface AddMarkInfo {
  markId?: string;
  markName: string;
  markUrl: string;
  markIcon: string;
  markGroupId: string;
  markGroupName?: string;
}

export interface MarkGroupInfo {
  id?: string | number;
  markGroupName: string;
  userId: string | number;
  sort: number;
  type: string;
}

export interface IMarkItem {
  id: string | number;
  markIcon: string;
  markName: string;
  markUrl: string;
  sort: number;
}

export interface MarkList {
  id: string | number;
  markGroupName: string;
  userId: string | number;
  marks: Array<IMarkItem>;
  sort: number;
  type: string;
}

// 保存卡片位置的入参
export interface UpdateSortParams {
  // 当前用户所有标签组 id 的展示顺序
  markGroupOrder: number[];
  // 每个标签组内标签 id 的顺序，键为标签组 id
  markOrder: Record<string, number[]>;
}

// 删除标签组入参
export interface MarkGroupDeleteParams {
  markGroupId: number;
}
