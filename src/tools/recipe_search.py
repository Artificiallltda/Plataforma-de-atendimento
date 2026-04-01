"""
Recipe Search Engine para ChefIA
Implementação de busca semântica em receitas com personalização por perfil gastronômico.

Este módulo permite buscar receitas por similaridade semântica e personalizar
recomendações baseado no perfil de preferências do usuário.
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass, asdict
from enum import Enum

# ── NOVA BIBLIOTECA GOOGLE GENAI ──
import google.genai as genai
from google.genai import types
from supabase import create_client, Client
from dotenv import load_dotenv
from pathlib import Path

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ── CARREGAR .ENV COM CAMINHO ABSOLUTO ──
env_path = Path(__file__).parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path, override=True)
    logger.info(f"✅ recipe_search: .env carregado de: {env_path}")


class DietaryPreference(str, Enum):
    """Preferências dietéticas do usuário."""
    OMNIVORE = "omnivore"
    VEGETARIAN = "vegetarian"
    VEGAN = "vegan"
    GLUTEN_FREE = "gluten_free"
    DAIRY_FREE = "dairy_free"
    LOW_CARB = "low_carb"
    KETO = "keto"
    PALEO = "paleo"


class CuisineType(str, Enum):
    """Tipos de culinária."""
    BRAZILIAN = "brazilian"
    ITALIAN = "italian"
    ASIAN = "asian"
    MEXICAN = "mexican"
    FRENCH = "french"
    SPANISH = "spanish"
    INDIAN = "indian"
    MEDITERRANEAN = "mediterranean"
    FUSION = "fusion"


class DifficultyLevel(str, Enum):
    """Nível de dificuldade da receita."""
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


@dataclass
class UserGastronomicProfile:
    """Perfil gastronômico do usuário."""
    user_id: str
    dietary_preferences: List[DietaryPreference]
    favorite_cuisines: List[CuisineType]
    allergies: List[str]
    disliked_ingredients: List[str]
    preferred_difficulty: DifficultyLevel
    cooking_time_preference: int  # em minutos
    spice_level: int  # 0-10
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Converte para dicionário."""
        return {
            "user_id": self.user_id,
            "dietary_preferences": [p.value for p in self.dietary_preferences],
            "favorite_cuisines": [c.value for c in self.favorite_cuisines],
            "allergies": self.allergies,
            "disliked_ingredients": self.disliked_ingredients,
            "preferred_difficulty": self.preferred_difficulty.value,
            "cooking_time_preference": self.cooking_time_preference,
            "spice_level": self.spice_level,
            "metadata": self.metadata or {},
        }


@dataclass
class Recipe:
    """Representa uma receita."""
    id: str
    title: str
    description: str
    ingredients: List[str]
    instructions: List[str]
    cuisine_type: CuisineType
    difficulty_level: DifficultyLevel
    cooking_time: int  # em minutos
    servings: int
    dietary_tags: List[str]
    spice_level: int  # 0-10
    embedding: Optional[List[float]] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Converte para dicionário."""
        data = {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "ingredients": self.ingredients,
            "instructions": self.instructions,
            "cuisine_type": self.cuisine_type.value,
            "difficulty_level": self.difficulty_level.value,
            "cooking_time": self.cooking_time,
            "servings": self.servings,
            "dietary_tags": self.dietary_tags,
            "spice_level": self.spice_level,
            "metadata": self.metadata or {},
            "created_at": self.created_at,
        }
        if self.embedding:
            data["embedding"] = self.embedding
        return data


class RecipeSearchEngine:
    """
    Engine de busca semântica para receitas com personalização.

    Utiliza Gemini Embedding 2 para vetorizar receitas e Supabase pgvector
    para armazenamento e busca semântica com filtros de personalização.
    """

    # Configurações do modelo de embedding
    EMBEDDING_MODEL = "models/gemini-embedding-2-preview"  # ✅ Modelo oficial Gemini Embedding 2
    EMBEDDING_DIMENSION = 3072  # Gemini Embedding 2 usa 3072 dimensões
    SIMILARITY_THRESHOLD = 0.5
    MAX_RESULTS = 10

    def __init__(
        self,
        supabase_url: Optional[str] = None,
        supabase_key: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
    ):
        """
        Inicializa o engine de busca de receitas.

        Args:
            supabase_url: URL do projeto Supabase (padrão: env SUPABASE_URL)
            supabase_key: Chave de API do Supabase (padrão: env SUPABASE_KEY)
            gemini_api_key: Chave de API do Google Gemini (padrão: env GEMINI_API_KEY)
        """
        # Configurar Gemini API
        self.gemini_api_key = gemini_api_key or os.getenv("GEMINI_API_KEY")
        if not self.gemini_api_key:
            raise ValueError(
                "GEMINI_API_KEY não configurada. "
                "Defina a variável de ambiente ou passe como argumento."
            )
        # NOTA: Não precisa de configure() na nova biblioteca google.genai
        # A chave é passada diretamente no client.models.embed_content()

        # Configurar Supabase
        self.supabase_url = supabase_url or os.getenv("SUPABASE_URL")
        # Tentar SUPABASE_SERVICE_KEY primeiro, depois SUPABASE_KEY como fallback
        self.supabase_key = supabase_key or os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

        if not self.supabase_url or not self.supabase_key:
            raise ValueError(
                "SUPABASE_URL e SUPABASE_KEY não configuradas. "
                "Defina as variáveis de ambiente."
            )

        self.supabase: Client = create_client(self.supabase_url, self.supabase_key)
        logger.info("RecipeSearchEngine inicializado com sucesso")

    def _embed_text(self, text: str) -> List[float]:
        """
        Gera embedding para um texto usando Google Gemini Embedding 2.

        Args:
            text: Texto para vetorizar

        Returns:
            Lista de floats representando o embedding (3072 dimensões)
        """
        try:
            logger.debug(f"Gerando embedding para texto de {len(text)} caracteres")
            
            # Criar cliente com a chave API correta
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("GEMINI_API_KEY não configurada")
            
            client = genai.Client(api_key=api_key)
            
            # Usar modelo oficial Gemini Embedding 2
            embedding_response = client.models.embed_content(
                model="models/gemini-embedding-2-preview",
                contents=[text]
            )
            
            # Extrair embedding da resposta
            embedding = embedding_response.embeddings[0].values
            
            logger.debug(f"✅ Embedding gerado com sucesso: {len(embedding)} dimensões (Gemini Embedding 2)")
            return embedding
            
        except Exception as e:
            logger.error(f"Erro ao gerar embedding: {str(e)}")
            raise

    def _create_recipe_text_for_embedding(self, recipe: Recipe) -> str:
        """
        Cria texto consolidado para embedding da receita.

        Args:
            recipe: Objeto Recipe

        Returns:
            Texto consolidado para embedding
        """
        text_parts = [
            recipe.title,
            recipe.description,
            f"Culinária: {recipe.cuisine_type.value}",
            f"Ingredientes: {', '.join(recipe.ingredients)}",
            f"Tags dietéticas: {', '.join(recipe.dietary_tags)}",
            f"Nível de dificuldade: {recipe.difficulty_level.value}",
            f"Tempo de preparo: {recipe.cooking_time} minutos",
            f"Nível de tempero: {recipe.spice_level}/10",
        ]
        return " ".join(text_parts)

    def add_recipe(
        self,
        recipe: Recipe,
    ) -> str:
        """
        Adiciona uma receita ao banco de dados com embedding (ou sem se não disponível).

        Args:
            recipe: Objeto Recipe

        Returns:
            ID da receita armazenada
        """
        try:
            # Gerar embedding (com fallback se não disponível)
            embedding = None
            try:
                recipe_text = self._create_recipe_text_for_embedding(recipe)
                embedding = self._embed_text(recipe_text)
                recipe.embedding = embedding
                logger.info(f"✅ Embedding gerado para receita: {recipe.id}")
            except Exception as e:
                logger.warning(f"⚠️  Embedding não disponível para receita {recipe.id}: {e}")
                logger.warning("💡 Receita será armazenada sem embedding (busca por texto será usada)")

            # Preparar dados para armazenamento
            data_to_store = {
                "id": recipe.id,
                "title": recipe.title,
                "description": recipe.description,
                "ingredients": recipe.ingredients,
                "instructions": recipe.instructions,
                "cuisine_type": recipe.cuisine_type.value,
                "difficulty_level": recipe.difficulty_level.value,
                "cooking_time": recipe.cooking_time,
                "servings": recipe.servings,
                "dietary_tags": recipe.dietary_tags,
                "spice_level": recipe.spice_level,
                "metadata": recipe.metadata or {},
                "created_at": recipe.created_at or datetime.now().isoformat(),
            }
            
            # Adicionar embedding apenas se estiver disponível
            if embedding:
                data_to_store["embedding"] = embedding

            # Armazenar no Supabase
            response = self.supabase.table("recipes").insert(data_to_store).execute()

            logger.info(f"✅ Receita adicionada: {recipe.id}" + (" com embedding" if embedding else " (sem embedding)"))
            return recipe.id

        except Exception as e:
            logger.error(f"Erro ao adicionar receita: {str(e)}")
            raise

    def search_recipes(
        self,
        query: str,
        limit: int = None,
        threshold: float = None,
        cuisine_filter: Optional[CuisineType] = None,
        difficulty_filter: Optional[DifficultyLevel] = None,
        max_cooking_time: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Busca receitas semanticamente similares à query (com fallback para busca por texto).

        Args:
            query: Texto para buscar (ex: "receita rápida com frango")
            limit: Número máximo de resultados (padrão: MAX_RESULTS)
            threshold: Limiar de similaridade (padrão: SIMILARITY_THRESHOLD)
            cuisine_filter: Filtrar por tipo de culinária (opcional)
            difficulty_filter: Filtrar por dificuldade (opcional)
            max_cooking_time: Tempo máximo de preparo em minutos (opcional)

        Returns:
            Lista de receitas similares ordenadas por relevância
        """
        try:
            limit = limit or self.MAX_RESULTS
            threshold = threshold or self.SIMILARITY_THRESHOLD

            # Tentar gerar embedding da query
            query_embedding = None
            try:
                query_embedding = self._embed_text(query)
            except Exception as e:
                logger.warning(f"⚠️  Embedding não disponível para busca: {e}")
                logger.warning("💡 Usando busca por texto simples como fallback")

            # Se embedding não estiver disponível, usar busca por texto
            if not query_embedding:
                return self._search_recipes_by_text(
                    query=query,
                    limit=limit,
                    cuisine_filter=cuisine_filter,
                    difficulty_filter=difficulty_filter,
                    max_cooking_time=max_cooking_time
                )

            # Construir filtros adicionais
            filters = []
            if cuisine_filter:
                filters.append(f"cuisine_type = '{cuisine_filter.value}'")
            if difficulty_filter:
                filters.append(f"difficulty_level = '{difficulty_filter.value}'")
            if max_cooking_time:
                filters.append(f"cooking_time <= {max_cooking_time}")

            filter_clause = " AND ".join(filters) if filters else "TRUE"

            # Buscar via RPC
            response = self.supabase.rpc(
                "search_recipes_semantic",
                {
                    "query_embedding": query_embedding,
                    "similarity_threshold": threshold,
                    "max_results": limit,
                    "filter_clause": filter_clause,
                },
            ).execute()

            results = response.data if response.data else []
            logger.info(f"Encontradas {len(results)} receitas similares")
            return results

        except Exception as e:
            logger.error(f"Erro ao buscar receitas: {str(e)}")
            return []

    def _search_recipes_by_text(
        self,
        query: str,
        limit: int = 10,
        cuisine_filter: Optional[CuisineType] = None,
        difficulty_filter: Optional[DifficultyLevel] = None,
        max_cooking_time: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Fallback: Busca receitas por texto simples quando embeddings não estão disponíveis.

        Args:
            query: Texto para buscar
            limit: Número máximo de resultados
            cuisine_filter: Filtrar por culinária
            difficulty_filter: Filtrar por dificuldade
            max_cooking_time: Tempo máximo de preparo

        Returns:
            Lista de receitas encontradas
        """
        try:
            # Construir query com filtros
            query_builder = self.supabase.table("recipes").select("*")
            
            # Filtro por texto (usando ilike para busca case-insensitive)
            # Dividir query em palavras-chave
            keywords = query.lower().split()
            for keyword in keywords[:3]:  # Usar até 3 palavras-chave
                if len(keyword) > 2:  # Ignorar palavras muito curtas
                    query_builder = query_builder.or_(
                        f"title.ilike.%{keyword}%,description.ilike.%{keyword}%"
                    )
            
            # Aplicar filtros adicionais
            if cuisine_filter:
                query_builder = query_builder.eq("cuisine_type", cuisine_filter.value)
            
            if difficulty_filter:
                query_builder = query_builder.eq("difficulty_level", difficulty_filter.value)
            
            if max_cooking_time:
                query_builder = query_builder.lte("cooking_time", max_cooking_time)
            
            # Ordenar por popularidade (se existir) ou mais recentes
            try:
                response = query_builder.order("popularity_score", desc=True).limit(limit).execute()
            except:
                response = query_builder.order("created_at", desc=True).limit(limit).execute()
            
            results = response.data if response.data else []
            logger.info(f"📝 Busca por texto encontrou {len(results)} receitas")
            
            # Adicionar score de similaridade fake para compatibilidade
            for recipe in results:
                recipe["similarity"] = 0.5  # Score médio para busca por texto
            
            return results
            
        except Exception as e:
            logger.error(f"Erro na busca por texto: {str(e)}")
            return []

    def personalize_recommendations(
        self,
        query: str,
        user_profile: UserGastronomicProfile,
        limit: int = None,
    ) -> List[Dict[str, Any]]:
        """
        Busca receitas personalizadas baseado no perfil do usuário.

        Args:
            query: Texto para buscar
            user_profile: Perfil gastronômico do usuário
            limit: Número máximo de resultados

        Returns:
            Lista de receitas personalizadas
        """
        try:
            limit = limit or self.MAX_RESULTS

            # Gerar embedding da query
            query_embedding = self._embed_text(query)

            # Buscar receitas via RPC com personalização
            response = self.supabase.rpc(
                "search_recipes_personalized",
                {
                    "query_embedding": query_embedding,
                    "user_id": user_profile.user_id,
                    "max_results": limit,
                },
            ).execute()

            results = response.data if response.data else []

            # Aplicar filtros de personalização em Python como fallback
            filtered_results = self._apply_user_filters(results, user_profile)

            logger.info(
                f"Encontradas {len(filtered_results)} receitas personalizadas para {user_profile.user_id}"
            )
            return filtered_results

        except Exception as e:
            logger.error(f"Erro ao personalizar recomendações: {str(e)}")
            return []

    def _apply_user_filters(
        self,
        recipes: List[Dict[str, Any]],
        user_profile: UserGastronomicProfile,
    ) -> List[Dict[str, Any]]:
        """
        Aplica filtros de personalização às receitas.

        Args:
            recipes: Lista de receitas
            user_profile: Perfil do usuário

        Returns:
            Receitas filtradas e pontuadas
        """
        filtered = []

        for recipe in recipes:
            # Verificar alergias
            if any(allergen in recipe.get("ingredients", []) 
                   for allergen in user_profile.allergies):
                continue

            # Verificar ingredientes não desejados
            if any(disliked in recipe.get("ingredients", [])
                   for disliked in user_profile.disliked_ingredients):
                continue

            # Calcular score de personalização
            score = 1.0

            # Bônus por culinária favorita
            if recipe.get("cuisine_type") in [c.value for c in user_profile.favorite_cuisines]:
                score += 0.2

            # Penalidade por dificuldade
            if recipe.get("difficulty_level") == user_profile.preferred_difficulty.value:
                score += 0.1
            elif recipe.get("difficulty_level") != user_profile.preferred_difficulty.value:
                score -= 0.05

            # Penalidade por tempo de preparo
            if recipe.get("cooking_time", 0) > user_profile.cooking_time_preference:
                score -= 0.1

            # Ajuste por nível de tempero
            recipe_spice = recipe.get("spice_level", 5)
            spice_diff = abs(recipe_spice - user_profile.spice_level)
            score -= (spice_diff / 10) * 0.1

            recipe["personalization_score"] = score
            filtered.append(recipe)

        # Ordenar por score de personalização e similaridade
        filtered.sort(
            key=lambda x: (x.get("personalization_score", 0), x.get("similarity", 0)),
            reverse=True
        )

        return filtered

    def save_user_profile(
        self,
        profile: UserGastronomicProfile,
    ) -> str:
        """
        Salva o perfil gastronômico do usuário.

        Args:
            profile: Perfil do usuário

        Returns:
            ID do usuário
        """
        try:
            response = self.supabase.table("user_gastronomic_profiles").upsert(
                profile.to_dict()
            ).execute()

            logger.info(f"Perfil do usuário salvo: {profile.user_id}")
            return profile.user_id

        except Exception as e:
            logger.error(f"Erro ao salvar perfil do usuário: {str(e)}")
            raise

    def get_user_profile(
        self,
        user_id: str,
    ) -> Optional[UserGastronomicProfile]:
        """
        Recupera o perfil gastronômico do usuário.

        Args:
            user_id: ID do usuário

        Returns:
            Perfil do usuário ou None se não encontrado
        """
        try:
            response = self.supabase.table("user_gastronomic_profiles").select(
                "*"
            ).eq("user_id", user_id).execute()

            if not response.data:
                return None

            data = response.data[0]
            profile = UserGastronomicProfile(
                user_id=data["user_id"],
                dietary_preferences=[
                    DietaryPreference(p) for p in data.get("dietary_preferences", [])
                ],
                favorite_cuisines=[
                    CuisineType(c) for c in data.get("favorite_cuisines", [])
                ],
                allergies=data.get("allergies", []),
                disliked_ingredients=data.get("disliked_ingredients", []),
                preferred_difficulty=DifficultyLevel(
                    data.get("preferred_difficulty", "medium")
                ),
                cooking_time_preference=data.get("cooking_time_preference", 60),
                spice_level=data.get("spice_level", 5),
                metadata=data.get("metadata"),
            )
            return profile

        except Exception as e:
            logger.error(f"Erro ao recuperar perfil do usuário: {str(e)}")
            return None

    def get_trending_recipes(
        self,
        limit: int = 10,
        cuisine_filter: Optional[CuisineType] = None,
    ) -> List[Dict[str, Any]]:
        """
        Retorna receitas mais populares.

        Args:
            limit: Número máximo de resultados
            cuisine_filter: Filtrar por tipo de culinária (opcional)

        Returns:
            Lista de receitas populares
        """
        try:
            query = self.supabase.table("recipes").select(
                "*"
            ).order("popularity_score", desc=True)

            if cuisine_filter:
                query = query.eq("cuisine_type", cuisine_filter.value)

            response = query.limit(limit).execute()
            return response.data if response.data else []

        except Exception as e:
            logger.error(f"Erro ao buscar receitas em tendência: {str(e)}")
            return []

    def rate_recipe(
        self,
        user_id: str,
        recipe_id: str,
        rating: int,
        comment: Optional[str] = None,
    ) -> str:
        """
        Registra avaliação do usuário para uma receita.

        Args:
            user_id: ID do usuário
            recipe_id: ID da receita
            rating: Nota de 1 a 5
            comment: Comentário opcional

        Returns:
            ID da avaliação
        """
        try:
            if not 1 <= rating <= 5:
                raise ValueError("Rating deve estar entre 1 e 5")

            response = self.supabase.table("recipe_ratings").insert(
                {
                    "user_id": user_id,
                    "recipe_id": recipe_id,
                    "rating": rating,
                    "comment": comment,
                    "created_at": datetime.now().isoformat(),
                }
            ).execute()

            logger.info(f"Avaliação registrada: {recipe_id} por {user_id}")
            return response.data[0]["id"] if response.data else ""

        except Exception as e:
            logger.error(f"Erro ao registrar avaliação: {str(e)}")
            raise


# Exemplo de uso
if __name__ == "__main__":
    # Inicializar engine
    engine = RecipeSearchEngine()

    # Criar perfil do usuário
    user_profile = UserGastronomicProfile(
        user_id="user_123",
        dietary_preferences=[DietaryPreference.VEGETARIAN],
        favorite_cuisines=[CuisineType.ITALIAN, CuisineType.ASIAN],
        allergies=["peanuts", "shellfish"],
        disliked_ingredients=["olives"],
        preferred_difficulty=DifficultyLevel.MEDIUM,
        cooking_time_preference=45,
        spice_level=6,
    )

    # Salvar perfil
    engine.save_user_profile(user_profile)

    # Criar algumas receitas de exemplo
    recipe_1 = Recipe(
        id="recipe_001",
        title="Pasta Primavera",
        description="Massa fresca com vegetais da estação",
        ingredients=["pasta", "tomate", "abobrinha", "pimentão", "azeite"],
        instructions=["Cozinhe a pasta", "Refogue os vegetais", "Misture tudo"],
        cuisine_type=CuisineType.ITALIAN,
        difficulty_level=DifficultyLevel.EASY,
        cooking_time=30,
        servings=4,
        dietary_tags=["vegetarian", "gluten_free_option"],
        spice_level=2,
    )

    recipe_2 = Recipe(
        id="recipe_002",
        title="Stir-fry de Vegetais Asiático",
        description="Vegetais crocantes no estilo asiático",
        ingredients=["brócolis", "cenoura", "repolho", "gengibre", "molho de soja"],
        instructions=["Corte os vegetais", "Aqueça o wok", "Frite rapidamente"],
        cuisine_type=CuisineType.ASIAN,
        difficulty_level=DifficultyLevel.MEDIUM,
        cooking_time=20,
        servings=2,
        dietary_tags=["vegetarian", "vegan"],
        spice_level=5,
    )

    # Adicionar receitas
    engine.add_recipe(recipe_1)
    engine.add_recipe(recipe_2)

    # Buscar receitas personalizadas
    results = engine.personalize_recommendations(
        query="receita vegetariana rápida",
        user_profile=user_profile,
        limit=5,
    )

    print("Receitas personalizadas encontradas:")
    for recipe in results:
        print(f"- {recipe.get('title')} (Similaridade: {recipe.get('similarity', 0):.2%})")

    # Registrar avaliação
    if results:
        engine.rate_recipe(
            user_id=user_profile.user_id,
            recipe_id=results[0].get("id"),
            rating=5,
            comment="Adorei! Muito saudável e rápido de fazer.",
        )
