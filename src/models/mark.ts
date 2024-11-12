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
}

export interface MarkItem {
  id: string | number;
  markIcon: string;
  markName: string;
  markUrl: string;
}

export interface MarkList {
  id: string | number;
  markGroupName: string;
  userId: string | number;
  marks: Array<MarkItem>;
}
