// Kotlin fixture
package com.example

data class User(val id: String, val name: String)

class UserService(private val repo: UserRepository) {
    fun getUser(id: String): User? = repo.findById(id)

    suspend fun createUser(dto: CreateUserDto): User {
        return repo.save(User(dto.id, dto.name))
    }

    private fun validate(user: User): Boolean = user.id.isNotEmpty()
}

interface Repository<T> {
    fun findById(id: String): T?
    suspend fun save(entity: T): T
}

fun formatUser(user: User): String = "${user.id}:${user.name}"
