
import request from "../request";

export function getWeather() {
  return request({
    url: "https://restapi.amap.com/v3/weather/weatherInfo?city=440606&key=b318ccb69665a170cf9e6df66778e376",
    method: "GET",
  });
}

