import request from "../request";
import { AddMarkInfo } from "../../models/mark";

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