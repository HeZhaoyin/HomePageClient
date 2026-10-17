import request from "../request";
import { AddMarkInfo, UpdateSortParams, MarkGroupDeleteParams } from "../../models/mark";

export function getMarkWithoutLogin() {
  return request({
    url: "/mark/getMarkWithoutLogin",
    method: "GET",
  });
}

export function getMarkGroupWithoutLogin() {
  return request({
    url: "/mark/getMarkGroupWithoutLogin",
    method: "GET",
  });
}

export function getMark() {
  return request({
    url: "/mark/getMark",
    method: "GET",
  });
}

export function getMarkGroup() {
  return request({
    url: "/mark/getMarkGroup",
    method: "GET",
  });
}

export function uploadMarkIcon(data: FormData) {
  return request({
    url: "/mark/uploadMarkIcon",
    method: "POST",
    data: data,
  });
}

export function addMark(data: AddMarkInfo) {
  return request({
    url: "/mark/addMark",
    method: "POST",
    data: data,
  });
}

export function getMarkIconByURL(url: String) {
  return request({
    url: '/mark/getIcon',
    method: 'GET',
    params: { url: url }
  })
}

// 保存卡片位置（标签组顺序 + 组内标签顺序）
export function updateSort(data: UpdateSortParams) {
  return request({
    url: "/mark/updateSort",
    method: "POST",
    data: data,
  });
}

// 删除标签组（级联删除组内标签）
export function deleteMarkGroup(data: MarkGroupDeleteParams) {
  return request({
    url: "/mark/deleteMarkGroup",
    method: "POST",
    data: data,
  });
}