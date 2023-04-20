md文件中的图片格式如下:
```
![1](https://p.ipic.vip/67o2jq.jpg)
```

如果使用了类似iPic这样的工具上传到微博图床, 微博会因为referer的拦截而屏蔽对应图片, 用这个脚本可以下载md里面的所有符合以上格式的图片,并上传到自己的七牛云

``` js
npm install
node index
```