"""
Ferramenta /search_recipe para ChefIA
Integração do RecipeSearchEngine com o sistema de ferramentas do ChefIA.

Uso:
  /search_recipe "almoço leve com frango"
  /search_recipe "massa vegetariana rápida" --profile usuario_123
"""

import os
import logging
from typing import Optional, List, Dict, Any
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from .recipe_search import (
    RecipeSearchEngine,
    UserGastronomicProfile,
    DietaryPreference,
    CuisineType,
    DifficultyLevel
)

logger = logging.getLogger(__name__)


class SearchRecipeInput(BaseModel):
    """Schema de entrada para busca de receitas."""
    query: str = Field(..., description="Texto de busca (ex: 'almoço leve com frango')")
    user_id: Optional[str] = Field(None, description="ID do usuário para personalização")
    limit: int = Field(5, description="Número máximo de resultados (default: 5)")
    max_cooking_time: Optional[int] = Field(None, description="Tempo máximo em minutos")
    cuisine: Optional[str] = Field(None, description="Tipo de culinária (italian, asian, etc)")


@tool(args_schema=SearchRecipeInput)
async def search_recipe(
    query: str,
    user_id: Optional[str] = None,
    limit: int = 5,
    max_cooking_time: Optional[int] = None,
    cuisine: Optional[str] = None
) -> str:
    """
    Busca receitas no banco de dados do ChefIA usando busca semântica.

    Se user_id for fornecido, usa o perfil gastronômico do usuário para personalizar resultados.
    Caso contrário, faz busca semântica bruta.

    Args:
        query: Texto de busca (ex: "almoço leve com frango")
        user_id: ID do usuário para personalização (opcional)
        limit: Número máximo de resultados (default: 5)
        max_cooking_time: Tempo máximo de preparo em minutos (opcional)
        cuisine: Tipo de culinária (italian, asian, brazilian, etc) - opcional

    Returns:
        String formatada com lista de receitas encontradas
    """
    try:
        engine = RecipeSearchEngine()

        # Converter cuisine string para enum se fornecido
        cuisine_enum = None
        if cuisine:
            try:
                cuisine_enum = CuisineType(cuisine.lower())
            except ValueError:
                logger.warning(f"Culinária '{cuisine}' não reconhecida. Ignorando filtro.")

        resultados = []

        if user_id:
            # Busca personalizada com perfil do usuário
            logger.info(f"[ChefIA] Busca personalizada para {user_id}: {query}")

            perfil = engine.get_user_profile(user_id)
            if perfil:
                resultados = engine.personalize_recommendations(
                    query=query,
                    user_profile=perfil,
                    limit=limit
                )
            else:
                logger.warning(f"Perfil não encontrado para {user_id}. Usando busca bruta.")
                resultados = engine.search_recipes(
                    query=query,
                    limit=limit,
                    cuisine_filter=cuisine_enum,
                    max_cooking_time=max_cooking_time
                )
        else:
            # Busca semântica bruta
            logger.info(f"[ChefIA] Busca semântica: {query}")
            resultados = engine.search_recipes(
                query=query,
                limit=limit,
                cuisine_filter=cuisine_enum,
                max_cooking_time=max_cooking_time
            )

        if not resultados:
            return "🍳 Nenhuma receita encontrada para sua busca. Tente outros termos!"

        # Formatrar resultados
        linhas = [f"🍽️ **Receitas encontradas para '{query}':**\n"]

        for i, receita in enumerate(resultados, 1):
            titulo = receita.get('title', 'Sem título')
            descricao = receita.get('description', '')[:100]
            tempo = receita.get('cooking_time', 0)
            dificuldade = receita.get('difficulty_level', 'medium')
            culinaria = receita.get('cuisine_type', 'unknown')
            similaridade = receita.get('similarity', 0)
            score_personal = receita.get('personalization_score', 0)

            # Traduzir dificuldade
            diff_label = {
                'easy': '🟢 Fácil',
                'medium': '🟡 Médio',
                'hard': '🔴 Difícil'
            }.get(dificuldade, dificuldade)

            linhas.append(
                f"**{i}. {titulo}**\n"
                f"   {descricao}...\n"
                f"   ⏱️ {tempo} min | {diff_label} | {culinaria.capitalize()}\n"
            )

            if score_personal > 0:
                linhas.append(f"   ⭐ Score personalizado: {score_personal:.2f}\n")

        return "\n".join(linhas)

    except Exception as e:
        logger.exception(f"[ChefIA] Erro na busca de receitas: {e}")
        return f"❌ Erro ao buscar receitas: {str(e)}"


@tool
async def save_user_profile(
    user_id: str,
    dietary_preferences: List[str] = None,
    favorite_cuisines: List[str] = None,
    allergies: List[str] = None,
    disliked_ingredients: List[str] = None,
    preferred_difficulty: str = "medium",
    cooking_time_preference: int = 60,
    spice_level: int = 5
) -> str:
    """
    Salva ou atualiza o perfil gastronômico do usuário.

    Args:
        user_id: ID do usuário
        dietary_preferences: Preferências dietéticas (vegetarian, vegan, gluten_free, etc)
        favorite_cuisines: Culinárias favoritas (italian, asian, brazilian, etc)
        allergies: Alergias (amendoim, camarão, leite, etc)
        disliked_ingredients: Ingredientes que não gosta (azeitona, cebola, etc)
        preferred_difficulty: Dificuldade preferida (easy, medium, hard)
        cooking_time_preference: Tempo máximo de preparo em minutos
        spice_level: Nível de tempero (0-10, sendo 0 sem tempero e 10 muito apimentado)

    Returns:
        Mensagem de confirmação
    """
    try:
        engine = RecipeSearchEngine()

        # Converter strings para enums
        diet_prefs = []
        if dietary_preferences:
            for pref in dietary_preferences:
                try:
                    diet_prefs.append(DietaryPreference(pref.lower()))
                except ValueError:
                    logger.warning(f"Preferência '{pref}' não reconhecida")

        fav_cuisines = []
        if favorite_cuisines:
            for cuis in favorite_cuisines:
                try:
                    fav_cuisines.append(CuisineType(cuis.lower()))
                except ValueError:
                    logger.warning(f"Culinária '{cuis}' não reconhecida")

        perfil = UserGastronomicProfile(
            user_id=user_id,
            dietary_preferences=diet_prefs,
            favorite_cuisines=fav_cuisines,
            allergies=allergies or [],
            disliked_ingredients=disliked_ingredients or [],
            preferred_difficulty=DifficultyLevel(preferred_difficulty.lower()),
            cooking_time_preference=cooking_time_preference,
            spice_level=spice_level
        )

        engine.save_user_profile(perfil)

        return f"✅ Perfil gastronômico salvo para {user_id}!\n" \
               f"Preferências: {', '.join(p.value for p in diet_prefs)}\n" \
               f"Culinárias favoritas: {', '.join(c.value for c in fav_cuisines)}\n" \
               f"Alergias: {', '.join(allergies) if allergies else 'Nenhuma'}"

    except Exception as e:
        logger.exception(f"[ChefIA] Erro ao salvar perfil: {e}")
        return f"❌ Erro ao salvar perfil: {str(e)}"


@tool
async def get_user_profile(user_id: str) -> str:
    """
    Recupera o perfil gastronômico do usuário.

    Args:
        user_id: ID do usuário

    Returns:
        String formatada com informações do perfil
    """
    try:
        engine = RecipeSearchEngine()
        perfil = engine.get_user_profile(user_id)

        if not perfil:
            return f"❌ Perfil não encontrado para {user_id}"

        return (
            f"👤 **Perfil de {user_id}:**\n\n"
            f"**Preferências dietéticas:** {', '.join(p.value for p in perfil.dietary_preferences)}\n"
            f"**Culinárias favoritas:** {', '.join(c.value for c in perfil.favorite_cuisines)}\n"
            f"**Alergias:** {', '.join(perfil.allergies) if perfil.allergies else 'Nenhuma'}\n"
            f"**Ingredientes não gostados:** {', '.join(perfil.disliked_ingredients) if perfil.disliked_ingredients else 'Nenhum'}\n"
            f"**Dificuldade preferida:** {perfil.preferred_difficulty.value}\n"
            f"**Tempo de preparo:** {perfil.cooking_time_preference} minutos\n"
            f"**Nível de tempero:** {perfil.spice_level}/10"
        )

    except Exception as e:
        logger.exception(f"[ChefIA] Erro ao recuperar perfil: {e}")
        return f"❌ Erro ao recuperar perfil: {str(e)}"


# Lista de ferramentas exportadas
__all__ = ['search_recipe', 'save_user_profile', 'get_user_profile']
