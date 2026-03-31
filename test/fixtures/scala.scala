// Scala fixture
package com.example

case class User(id: String, name: String)

trait Repository[T] {
  def findById(id: String): Option[T]
  def save(entity: T): T
}

class UserService(repo: Repository[User]) {
  def getUser(id: String): Option[User] = repo.findById(id)

  def createUser(dto: CreateUserDto): User = {
    val user = User(dto.id, dto.name)
    repo.save(user)
  }
}

object UserService {
  def apply(repo: Repository[User]): UserService = new UserService(repo)
}

def hashPassword(password: String): String = password
