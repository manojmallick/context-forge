local json = require('dkjson')
local helper = require("app.helper")

--- Trim surrounding whitespace
local function trim(value)
  return value:gsub('^%s+', ''):gsub('%s+$', '')
end

--- Render a node
function M.render(node, opts)
  return helper.render(node, opts)
end

function player:move(dx, dy)
  self.x = self.x + dx
  self.y = self.y + dy
end

M.parse = function(input, strict)
  return json.decode(input, strict)
end

local private = function(secret)
  return secret
end
