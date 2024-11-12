import request from "../request";
import LoginUserInfo from "../../models/user";

export function login(data: LoginUserInfo) {
  return request({
    url: "/user/login",
    method: "POST",
    data: data,
  });
}

export function register(data: LoginUserInfo) {
  return request({
    url: "/user/registerUser",
    method: "POST",
    data: data,
  });
}
