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
